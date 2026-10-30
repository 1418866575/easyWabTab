import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import JSZip from 'jszip'
import yaml from 'js-yaml'
import type { Site } from '../types'
import { CATEGORIES } from '../types'
import { useMarkdown } from '../composables/useMarkdown'
import { serializeRepeatYaml } from '../composables/countdownCore'
import {
  createIconNameTable,
  registerIconPath,
  iconPathEntries,
  parseDataUrl,
  resolveIconFilesInParsed,
  isRelativeIconPath,
  shouldFillIcon,
  iconDisplayName,
  type IconFileEntry
} from '../composables/siteIconPortability'
import { useCategoriesStore } from './categories'
import { useSearchEnginesStore } from './searchEngines'
import { usePasswordsStore } from './passwords'
import { useCountdownsStore } from '@/stores/countdowns'
import { useIconsStore } from '@/stores/icons'
import { useAppSettingsStore } from '@/stores/settings'
import {
  checkDeadLinks,
  saveCheckResults,
  loadCheckResults,
  type CheckProgress
} from '../composables/useDeadLinkChecker'
import { scheduleAutoBackup } from '../composables/useBackup'
import { markDirty } from '@/composables/useCloudSync'
import {
  armNavExplicitMutation,
  evaluateUserSitesCount,
  isNavExplicitMutationActive,
  isSuspectedWipe
} from '@/composables/navDataGuard'
// 守卫依据（基线/高水位）自 v20 起存 IndexedDB，与 nav 主数据同介质；
// 旧版存 localStorage 会被移动端系统单独回收，回收后守卫整体失效 —— 详见 navMeta.ts 文件头
import {
  ensureBaseline,
  noteHighWater,
  readBaseline,
  readHighWater,
  writeBaseline
} from '@/composables/navMeta'
import { getPref, setPrefNow, isNavReadonly } from '@/composables/useNavPrefs'
import { useToast } from '@/composables/useToast'

/**
 * 工具箱在导航列表里的地址。
 * 这张卡片由 store 注入（不是用户数据），并在 filteredSites 里被钉在列表第一位，
 * 因此也不允许作为拖拽的落点（否则交换 sort 会把它的 0 换给别的站点）。
 */
export const TOOLBOX_URL = '/toolbox'
/** 站内入口卡的识别标记（由 store 注入，不是用户数据） */
export const MODULE_SITE_TAG = '站内模块'
/** 站内入口卡的列表顺序：工具箱 → 博客前台 → 图书馆（永远排在任何普通站点之前） */
export const MODULE_SITE_ORDER = [TOOLBOX_URL, '/blog', '/books']

/** 是否为站内入口卡（工具箱 / 博客前台 / 图书馆） */
export function isModuleSite(site: { tags?: string[] }): boolean {
  return (site.tags || []).includes(MODULE_SITE_TAG)
}

/** 排序权重：入口卡按 MODULE_SITE_ORDER 归位，非入口卡统一排在所有入口卡之后 */
function moduleRank(site: { url: string; tags?: string[] }): number {
  if (!isModuleSite(site)) return MODULE_SITE_ORDER.length
  const i = MODULE_SITE_ORDER.indexOf(site.url)
  return i === -1 ? MODULE_SITE_ORDER.length : i
}

export const useSitesStore = defineStore('sites', () => {
  const sites = ref<Site[]>([])
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])
  const selectedCategory = ref<string>('')
  const isLoading = ref(false)
  const currentPage = ref(1)
  const pageSize = ref(18)

  // 断链检测
  const isCheckingLinks = ref(false)
  const linkCheckProgress = ref<CheckProgress | null>(null)
  /** 上一次检测的结论汇总（total / 明确失效 / 无法判定），供 UI 解释结果 */
  const linkCheckSummary = ref<{ total: number; invalid: number; unknown: number } | null>(null)
  const showOnlyInvalid = ref(false)

  // ===== 数据降级保护（2026-10-07 事故后新增）=====
  // 事故形态：存储层某环节掉链子 → 站点列表骤降甚至清空 → 这份「残缺态」被当成用户数据写回
  //   → 再被自动推送到云端 → 其它设备连锁清空。
  // 保护思路：只给**显式用户改动**推进基线（见 navDataGuard），读取与自动写盘不推进；
  //   于是「用户真删了站点」不会被拦，「数据莫名没了却被自动回写」会被拦。
  /** 非用户自有站点的 URL（内置站点 + 游戏清单），用于统计「用户自有站点数」 */
  const nonUserUrls = new Set<string>()
  /** 保护触发原因（空串 = 正常），供 UI / 排障读取 */
  const dataGuardMessage = ref('')
  let guardToastShown = false

  /** 用户自有站点数：排除内置站点与游戏清单，避免内置数据掩盖「用户数据没了」 */
  function ownSiteCount(): number {
    if (nonUserUrls.size === 0) return sites.value.length
    return sites.value.filter(s => !nonUserUrls.has(s.url)).length
  }

  /** 用当前列表刷新基线（只在显式用户改动后调用，代表「这是用户想要的规模」） */
  function syncBaselineFromCurrent(): void {
    const n = ownSiteCount()
    writeBaseline(n)
    // 高水位只增不减：即便基线后来被用户真实删减拉低，历史最大规模仍留在 navmeta 里兜底
    noteHighWater(n)
  }

  /**
   * 用户在 UI 上做过一次显式改动（增/删/改站点）后就认为「眼前所见即其所愿」，写盘守卫放行。
   *
   * 标志放在 navDataGuard 里共享：推送守卫（useCloudSync）读同一份状态，
   * 否则会出现「本地写成功、推送却被永久拦下」的死锁。
   * 保护的靶子是「数据自己没了又被自动写盘/推送」，不是「用户正在手动整理时被卡住」。
   */
  function noteExplicitMutation(): void {
    armNavExplicitMutation()
    syncBaselineFromCurrent()
  }

  /**
   * 判断此刻能否把 sites.value 回写成 user-sites。
   * 返回空串 = 可写；非空 = 疑似降级的原因（应跳过写回）。
   *
   * 刻意做成**每次写盘实时判定**而非一次性上锁：数据一旦恢复（如云同步拉取成功）写入自动恢复，
   * 不会因为一次误判把整个会话变成只读。
   */
  function userSitesWriteBlockReason(): string {
    if (isNavReadonly()) return '导航存储读取失败（只读模式）'
    if (isNavExplicitMutationActive()) return ''
    const current = ownSiteCount()
    const verdict = evaluateUserSitesCount(current, readBaseline())
    if (verdict.tripped) return verdict.reason
    // 第二道判据：基线可能因先前几次写入已同步变小（单看它未必触发），
    // 「当前规模 vs 历史最大规模」则几乎只在数据丢失时才成立
    const high = readHighWater()
    if (isSuspectedWipe(current, high)) {
      return `站点数 ${current} 远低于历史最高 ${high}`
    }
    return ''
  }

  /** 真正拦下一次写盘时才提示用户（每个会话只弹一次，避免刷屏） */
  function warnOnGuard(reason: string): void {
    dataGuardMessage.value = reason
    if (guardToastShown) return
    guardToastShown = true
    console.error('[sites] 导航站点降级保护已触发，本次 user-sites 回写已跳过：', reason)
    try {
      useToast().error(
        `检测到导航站点数据疑似丢失（${reason}），已暂停写入本地与云端以免覆盖。` +
        '请到「设置 → 云同步」点击「拉取」恢复，或导入备份文件。'
      )
    } catch {
      // toast 未就绪（极早期初始化）不影响保护逻辑本身
    }
  }

  /**
   * 每次数据装载/变更后重算保护状态：恢复正常即清空。
   * 装载阶段**只记状态不弹提示**——那时还没发生写入，弹出来只是虚惊；
   * 真正被拦到写盘时才由 warnOnGuard 提示用户。
   */
  function refreshDataGuard(): void {
    const reason = userSitesWriteBlockReason()
    dataGuardMessage.value = reason
  }

  // 加载保存的检测结果
  function applySavedCheckResults() {
    const saved = loadCheckResults()
    if (Object.keys(saved).length === 0) return
    sites.value = sites.value.map(site => ({
      ...site,
      isValid: saved[site.url] ?? undefined
    }))
  }

  // 开始断链检测
  let checkAbortController: AbortController | null = null

  async function checkDeadLinksAction() {
    if (isCheckingLinks.value) {
      // 取消正在进行的检测
      checkAbortController?.abort()
      isCheckingLinks.value = false
      return
    }

    isCheckingLinks.value = true
    checkAbortController = new AbortController()
    linkCheckProgress.value = null
    linkCheckSummary.value = null

    const urls = sites.value.map(s => s.url)

    // 进度回调**只更新进度条**：原实现每个结果都 `sites.value[idx] = {...}`，
    // N 个站点就会触发 N 轮整页重渲染（检测期间滚动/输入明显卡顿）。
    const results = await checkDeadLinks(
      urls,
      (progress) => {
        linkCheckProgress.value = progress
      },
      checkAbortController.signal
    )

    // 一次性批量提交：只写有明确结论的站点。
    // reachable（跨域收到响应但读不到状态码）保持原状态不变 —— 既不谎报"有效"，也不误标"无效"。
    const byUrl = new Map(results.map(r => [r.url, r]))
    sites.value = sites.value.map(site => {
      const r = byUrl.get(site.url)
      if (!r || r.isValid === undefined) return site
      return { ...site, isValid: r.isValid }
    })

    // 保存结果
    saveCheckResults(results)

    // 结论汇总：项目上要能看出「多少是真失效、多少是浏览器根本判不了」
    linkCheckSummary.value = {
      total: results.length,
      invalid: results.filter(r => r.isValid === false).length,
      unknown: results.filter(r => r.isValid === undefined).length
    }

    isCheckingLinks.value = false
    linkCheckProgress.value = null
    checkAbortController = null
  }

  /**
   * 停止正在进行的断链检测。
   * 只中断后续 URL 的请求（checkDeadLinks 每个 URL 前检查 signal），
   * 已检测完成的部分由 checkDeadLinksAction 正常落盘保存，不会丢失。
   */
  function stopLinkCheckAction(): void {
    if (!isCheckingLinks.value) return
    checkAbortController?.abort()
    isCheckingLinks.value = false
  }

  // 获取无效站点数量
  const invalidCount = computed(() =>
    sites.value.filter(s => s.isValid === false).length
  )

  const { parseSitesFromMarkdown } = useMarkdown()

  // 总页数
  const totalPages = computed(() => {
    return Math.ceil(filteredSites.value.length / pageSize.value)
  })

  // 当前页数据
  const paginatedSites = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return filteredSites.value.slice(start, end)
  })

  // 筛选变化或分页大小变化时重置页码
  watch([searchQuery, selectedTags, selectedCategory, pageSize, showOnlyInvalid], () => {
    currentPage.value = 1
  }, { deep: true })

  // 排除「分类字段值为数值 0」的站点（数据层过滤：不渲染、不计数、不进分页）
  const visibleSites = computed(() =>
    sites.value.filter(site => (site.category as unknown as number) !== 0)
  )

  // 获取所有分类（基于已有数据）
  const allCategories = computed(() => {
    const categorySet = new Set<string>()
    visibleSites.value.forEach(site => {
      if (site.category) {
        categorySet.add(site.category)
      }
    })
    return CATEGORIES.filter(c => categorySet.has(c.id))
  })

  const allTags = computed(() => {
    const tagSet = new Set<string>()
    sites.value.forEach(site => {
      site.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  })

  // 按分类过滤的标签
  const tagsByCategory = computed(() => {
    if (!selectedCategory.value) {
      // 未选分类 → 返回全部标签
      return allTags.value
    }
    const tagSet = new Set<string>()
    visibleSites.value.forEach(site => {
      if (site.category === selectedCategory.value) {
        site.tags.forEach(tag => tagSet.add(tag))
      }
    })
    return Array.from(tagSet).sort()
  })

  const filteredSites = computed(() => {
    // 先过滤（已排除分类值为数值 0 的站点）
    const filtered = visibleSites.value.filter(site => {
      // 分类过滤
      if (selectedCategory.value && site.category !== selectedCategory.value) {
        return false
      }

      // 搜索过滤
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        const matchName = site.name.toLowerCase().includes(query)
        const matchDesc = site.description?.toLowerCase().includes(query)
        const matchTags = site.tags.some(tag => tag.toLowerCase().includes(query))
        if (!matchName && !matchDesc && !matchTags) {
          return false
        }
      }

      // 标签过滤
      if (selectedTags.value.length > 0) {
        const hasSelectedTag = selectedTags.value.some(tag => site.tags.includes(tag))
        if (!hasSelectedTag) {
          return false
        }
      }

      return true
    })

    // 断链过滤：只看无效站点
    if (showOnlyInvalid.value) {
      return filtered
        .filter(site => site.isValid === false)
        .sort((a, b) => {
          const sortA = a.sort ?? 1
          const sortB = b.sort ?? 1
          return sortB - sortA
        })
    }

    // 排序：站内入口卡（工具箱 → 博客前台 → 图书馆）永远在最前，其余按 sort 降序（点击频率高的在前）。
    // 入口卡不能靠 sort 值抬高：拖拽 swapSort、点击 incrementClick 都会改 sort，早晚被换走。
    filtered.sort(
      (a, b) => moduleRank(a) - moduleRank(b) || (b.sort ?? 1) - (a.sort ?? 1)
    )
    return filtered
  })

  // 按分类分组的网站
  const sitesByCategory = computed(() => {
    const grouped: Record<string, Site[]> = {}
    visibleSites.value.forEach(site => {
      const cat = site.category || 'other'
      if (!grouped[cat]) {
        grouped[cat] = []
      }
      grouped[cat].push(site)
    })
    return grouped
  })

  // 加载游戏清单
  async function loadGames() {
    try {
      const response = await fetch('/games/manifest.json')
      if (response.ok) {
        const gameEntries = await response.json()
        const gameSites: Site[] = gameEntries.map((game: any) => ({
          name: game.name,
          url: game.path,
          description: game.description,
          category: game.category || 'game',
          tags: ['游戏', '工具'],
          icon: game.icon || '',
          sort: 1,
          createdAt: new Date().toISOString()
        }))
        
        // 游戏清单不是用户数据：登记到「非用户站点」集合，降级统计时排除
        for (const g of gameSites) nonUserUrls.add(g.url)

        // 合并游戏到sites（避免重复）
        const existingUrls = new Set(sites.value.map(s => s.url))
        const newGames = gameSites.filter(g => !existingUrls.has(g.url))
        sites.value.push(...newGames)
      }
    } catch (e) {
      console.warn('Failed to load games manifest:', e)
    }
  }

  /* ===== 站内模块入口（原「左上角工作台面板」里的 博客前台 / 个人图书馆） =====
   * 迁移背景：这两个入口本质是站内页面，放进「导航列表」更符合"访问入口"的心智模型。
   * 实现要点：
   * - 名称 / 图标 / 可见性继续读设置里的 blogFrontPage* / booksPage* 三件套，
   *   保证迁移前后完全一致；关掉开关即从列表移除。
   * - 与内置站点、游戏清单一样登记进 nonUserUrls：不计入自有站点数、不参与降级守卫基线。
   * - 用「url + tag=站内模块」双条件识别自己注入的项：刷新时先摘后加不会重复，
   *   也不会误删用户自己手工添加的 /blog、/books 站点。
   */
  const MODULE_URLS = MODULE_SITE_ORDER
  const MODULE_TAG = MODULE_SITE_TAG
  /** 固定 createdAt，避免每次注入产生不同时间戳（不参与排序） */
  const MODULE_SINCE = '2026-10-26T00:00:00.000Z'
  /**
   * 站内入口卡的默认图标：彩色渐变圆角块 + 白色线条图形（lucide 风格）。
   * 三张卡共用这个工厂，保证风格一致、与列表里各家彩色 favicon 视觉重量相当。
   * 必须用 data URL 内联（不能塞 emoji：SiteCard 渲染的是 <img :src>）。
   */
  const moduleIcon = (from: string, to: string, body: string): string =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" ' +
        'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
        '</linearGradient></defs>' +
        '<rect width="24" height="24" rx="6" fill="url(#g)" stroke="none"/>' +
        '<g transform="translate(2.65 2.65) scale(0.78)">' +
        body +
        '</g></svg>'
    )

  /** 工具箱：橙色 + 工具箱 */
  const MODULE_TOOLBOX_ICON = moduleIcon(
    '#FFB27A',
    '#F0653A',
    '<path d="M16 12v4"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>' +
      '<path d="M18 6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/>' +
      '<path d="M8 12v4"/>'
  )
  /** 博客前台：蓝色 + 文章/报纸 */
  const MODULE_BLOG_ICON = moduleIcon(
    '#8AA6FF',
    '#4C6EF5',
    '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>' +
      '<path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>'
  )
  /** 图书馆：绿色 + 摊开的书 */
  const MODULE_BOOKS_ICON = moduleIcon(
    '#6EE7B7',
    '#10B981',
    '<path d="M12 7v14"/>' +
      '<path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
  )

  /** 依据当前设置生成应当出现在导航列表里的站内模块入口 */
  function buildModuleSites(): Site[] {
    let settings: ReturnType<typeof useAppSettingsStore>
    try {
      settings = useAppSettingsStore()
    } catch (e) {
      // 理论上不会发生（store 一定在 pinia 激活后使用）；保底不影响主流程
      console.warn('[sites] 读取设置失败，跳过站内模块入口：', e)
      return []
    }
    const out: Site[] = []
    if (settings.toolboxButtonVisible !== false) {
      out.push({
        name: settings.toolboxButtonDisplayName || '工具箱',
        url: TOOLBOX_URL,
        description: '站内工具箱：各类在线小工具集合',
        category: 'other',
        tags: [MODULE_TAG],
        icon: settings.toolboxButtonIcon || MODULE_TOOLBOX_ICON,
        sort: 0,
        createdAt: MODULE_SINCE
      })
    }
    if (settings.blogFrontPageVisible !== false) {
      out.push({
        name: settings.blogFrontPageDisplayName || '博客前台',
        url: '/blog',
        description: '站内博客阅读页：浏览已发布的文章',
        category: 'other',
        tags: [MODULE_TAG],
        icon: settings.blogFrontPageIcon || MODULE_BLOG_ICON,
        sort: 0,
        createdAt: MODULE_SINCE
      })
    }
    if (settings.booksPageVisible !== false) {
      out.push({
        name: settings.booksPageDisplayName || '图书馆',
        url: '/books',
        description: '站内个人图书馆：书架检索与站内阅读',
        category: 'other',
        tags: [MODULE_TAG],
        icon: settings.booksPageIcon || MODULE_BOOKS_ICON,
        sort: 0,
        createdAt: MODULE_SINCE
      })
    }
    return out
  }

  /** 摘掉自己注入过的站内模块入口（用户自建的同 url 站点没有该 tag，不会被误删） */
  function stripModuleEntries(): void {
    sites.value = sites.value.filter(
      (s) => !(MODULE_URLS.includes(s.url) && (s.tags || []).includes(MODULE_TAG))
    )
  }

  /** 重新对齐站内模块入口：先摘后加，天然幂等（设置变更 / 重复加载都不会产生重复入口） */
  function refreshModuleEntries(): void {
    stripModuleEntries()
    for (const m of buildModuleSites()) {
      // 已有同 url 的站点（用户手工加过，或内置清单里已有）→ 不重复注入
      if (sites.value.some((s) => s.url === m.url)) continue
      sites.value.push(m)
      // 站内模块不是用户数据：不计入自有站点数，也不参与降级守卫基线
      nonUserUrls.add(m.url)
    }
  }

  async function loadSites() {
    isLoading.value = true
    try {
      // 获取内置数据
      const response = await fetch('/data/sites.md')
      const content = await response.text()
      const { sites: builtInSites } = parseSitesFromMarkdown(content)
      // 内置站点不是用户数据：登记到「非用户站点」集合，降级统计（ownSiteCount）时排除
      for (const site of builtInSites) nonUserUrls.add(site.url)

      // 从 nav store 读取用户站点
      // JSON.parse 单独包一层：旧版这里一旦解析失败会直接跳到外层 catch → sites.value=[]，
      // 随后任何一次写盘都会把这份空态固化，是「数据莫名消失」的帮凶之一。
      const savedData = getPref('user-sites')
      let savedSites: Site[] = []
      if (savedData) {
        try {
          const parsed: unknown = JSON.parse(savedData)
          savedSites = Array.isArray(parsed) ? (parsed as Site[]) : []
        } catch (e) {
          savedSites = []
          console.error('[sites] user-sites 内容损坏，本次按空列表加载（未写回，原值保留在存储中）', e)
        }
      }

      // 使用 Map 合并数据，nav store 优先
      const sitesMap = new Map<string, Site>()

      // 先添加内置数据
      for (const site of builtInSites) {
        sitesMap.set(site.url, site)
      }

      // 再添加 nav store 数据（会覆盖同名 URL）
      for (const site of savedSites) {
        sitesMap.set(site.url, site)
      }

      // 转换为数组
      sites.value = Array.from(sitesMap.values())

      // 站内模块入口（工具箱 / 博客前台 / 图书馆）：原在左上角工作台面板，现作为导航列表里的入口卡片。
      // 必须放在 await loadGames() 之前——否则列表会先渲染出内置站点、再插入卡片，
      // 首屏能看到列表跳动（工具箱卡「永远第一」的位置也会短暂不成立）。
      refreshModuleEntries()

      // 加载游戏清单
      await loadGames()

      // 应用保存的断链检测结果
      applySavedCheckResults()

      // 首次（无基线时）按「用户自有站点数」确立基线；随后按当前数据重算保护状态。
      // 顺序必须是先 ensureBaseline 再 refreshDataGuard：否则首次进入会把当前数当成骤降。
      const own = ownSiteCount()
      ensureBaseline(own)
      // 每次成功装载都记一次高水位：它是「本机曾达到的最大规模」，
      // 日后 nav 记录被残缺内容覆盖、基线又同步变小时，靠它兜底识别空态
      noteHighWater(own)
      refreshDataGuard()
    } catch (error) {
      console.error('Failed to load sites:', error)
      sites.value = []
      // 装载本身失败（如 fetch 内置清单挂了）也属于降级场景：带上保护再退出
      refreshDataGuard()
    } finally {
      isLoading.value = false
    }
  }

  // 将多行文本处理为单行（用于 description 字段）
  function normalizeText(text: string | undefined): string | undefined {
    if (!text) return text
    // 将换行符、回车符、制表符等替换为空格，然后压缩连续空格
    return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function addSite(site: Site) {
    const newSite = {
      ...site,
      description: normalizeText(site.description),
      createdAt: new Date().toISOString()
    }
    sites.value.push(newSite)
    // 显式用户改动 → 准许按当前规模推进基线，避免用户正常增删被守卫误拦
    noteExplicitMutation()
    saveUserSites()
  }

  function updateSite(url: string, updatedSite: Partial<Site>) {
    const index = sites.value.findIndex(s => s.url === url)
    if (index !== -1) {
      sites.value[index] = {
        ...sites.value[index],
        ...updatedSite,
        description: normalizeText(updatedSite.description),
        updatedAt: new Date().toISOString()
      }
      // 用户在明确编辑站点 → 不应被降级守卫卡住（否则改了存不下来，用户只会更困惑）
      noteExplicitMutation()
      saveUserSites()
    }
  }

  function deleteSite(url: string) {
    sites.value = sites.value.filter(s => s.url !== url)
    // 删除会真实降低站点数：必须同步基线，否则后续所有写盘都会被守卫拦住
    noteExplicitMutation()
    saveUserSites()
  }

  // 取消失效标志（重新标记为未检测状态）
  function unmarkInvalid(url: string) {
    const index = sites.value.findIndex(s => s.url === url)
    if (index !== -1) {
      sites.value[index] = {
        ...sites.value[index],
        isValid: undefined
      }
      // 更新 localStorage 中的检测结果
      const saved = loadCheckResults()
      delete saved[url]
      // 重新保存
      const results = Object.entries(saved).map(([url, isValid]) => ({ url, isValid }))
      saveCheckResults(results)
    }
  }

  // 迁移网站到指定分类
  function migrateSitesToCategory(fromId: string, toId: string) {
    let migrated = 0
    sites.value.forEach(site => {
      if (site.category === fromId) {
        site.category = toId
        migrated++
      }
    })
    if (migrated > 0) {
      saveUserSites()
    }
    return migrated
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  function toggleTag(tag: string) {
    const index = selectedTags.value.indexOf(tag)
    if (index === -1) {
      selectedTags.value.push(tag)
    } else {
      selectedTags.value.splice(index, 1)
    }
  }

  function clearFilters() {
    searchQuery.value = ''
    selectedTags.value = []
    selectedCategory.value = ''
  }

  function setCategory(category: string) {
    selectedCategory.value = category
    // 切换分类时清除标签，避免旧分类的标签导致过滤结果为空
    selectedTags.value = []
  }

  function setPage(page: number) {
    currentPage.value = page
  }

  function setPageSize(size: number) {
    pageSize.value = size
  }

  // 调整站点 A 的 sort 值：设置为站点 B 的 sort+1（排在 B 前面）
  function swapSort(urlA: string, urlB: string) {
    const siteA = sites.value.find(s => s.url === urlA)
    const siteB = sites.value.find(s => s.url === urlB)
    if (!siteA || !siteB) return

    const sortB = siteB.sort ?? 1

    // 将 A 的 sort 设置为 B 的 sort+1（排在 B 前面）
    siteA.sort = sortB + 1

    // 持久化到 localStorage
    saveUserSites()
  }

  // ===== 写盘调度 =====
  // 原先每次操作（尤其点击站点）都同步执行 JSON.stringify 全量数据 + setItem，
  // 主线程阻塞明显。改为合并延迟写盘：连续操作只序列化一次。
  // 页面隐藏/卸载时立即 flush，保证数据不会因防抖而丢失。
  const SAVE_DEBOUNCE_MS = 400
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingClickCountsWrite = false

  function flushSave(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    try {
      // 降级保护：站点数较基线骤降（或存储处于只读）时，**跳过 user-sites 回写**。
      // 这条守卫拦住的是「数据没了 → 自动写盘把空/残缺态固化」这最关键的一环；
      // 点击计数等派生数据仍照常写，不影响体验。
      const blockReason = userSitesWriteBlockReason()
      if (blockReason) {
        warnOnGuard(blockReason)
        console.error('[sites] 已跳过本次 user-sites 回写，避免覆盖真实数据：', blockReason)
      } else {
        setPrefNow('user-sites', JSON.stringify(sites.value))
      }
    } catch {
      // 配额不足等异常保持原行为（IDB 写入失败由 setPrefNow 内部 catch 静默）
    }
    if (pendingClickCountsWrite) {
      try {
        setPrefNow('site-click-counts', JSON.stringify(clickCountsCache ?? {}))
      } catch {
        // 同上
      }
      pendingClickCountsWrite = false
    }
  }

  function onPageHide(): void {
    flushSave()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flushSave()
  }

  // store 为单例，生命周期等同应用，监听无需移除
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  // 设置里改了「工具箱 / 博客前台 / 图书馆」的名称、图标或可见性 → 立刻反映到导航列表，无需刷新页面。
  // 放在这里而不是 loadSites 内：设置是异步初始化的，加载完成后 watch 会自动补一次对齐。
  try {
    const settingsStore = useAppSettingsStore()
    watch(
      () => [
        settingsStore.toolboxButtonDisplayName,
        settingsStore.toolboxButtonIcon,
        settingsStore.toolboxButtonVisible,
        settingsStore.blogFrontPageDisplayName,
        settingsStore.blogFrontPageIcon,
        settingsStore.blogFrontPageVisible,
        settingsStore.booksPageDisplayName,
        settingsStore.booksPageIcon,
        settingsStore.booksPageVisible
      ],
      () => {
        // 只在已有站点数据时对齐，避免首屏 loadSites 之前就往空列表里塞入口
        if (sites.value.length > 0) refreshModuleEntries()
      }
    )
  } catch (e) {
    console.warn('[sites] 站内模块入口监听注册失败（不影响主流程）：', e)
  }

  // 点击网站时增加 sort 值（使用频率排序）
  function incrementClick(url: string) {
    const site = sites.value.find(s => s.url === url)
    if (!site) return

    // 排序方式为「自定义」（settings.navSortMode = 'custom'）时只记次数、不动 sort：
    // 否则用户拖拽排好的顺序会被每次点击持续打散，点开一个站再回来它已跳到最前。
    // 默认 'clicks' 保持既有「常用置顶」行为。
    if (useAppSettingsStore().navSortMode !== 'custom') {
      // sort 值加 1
      site.sort = (site.sort ?? 1) + 1
    }

    // 点击计数走内存缓存，不再每次 JSON.parse 全量历史
    const counts = loadClickCounts()
    counts[url] = (counts[url] ?? 0) + 1
    pendingClickCountsWrite = true

    // 持久化网站数据（合并延迟写盘）
    saveUserSites()
  }

  // 点击计数内存缓存（避免每次点击解析整份 JSON）
  let clickCountsCache: Record<string, number> | null = null

  // 加载点击计数
  function loadClickCounts(): Record<string, number> {
    if (clickCountsCache) return clickCountsCache
    let counts: Record<string, number>
    try {
      const data = getPref('site-click-counts')
      // JSON.parse 返回 any，直接赋给闭包变量会让 TS 把类型放宽回 Record | null
      counts = data ? (JSON.parse(data) as Record<string, number>) : {}
    } catch {
      counts = {}
    }
    clickCountsCache = counts
    return counts
  }

  function saveUserSites() {
    // 脏标记与自动备份调度保持即时执行（轻量，且不改变云同步语义）
    markDirty()
    const categoriesStore = useCategoriesStore()
    const enginesStore = useSearchEnginesStore()
    scheduleAutoBackup(
      sites.value,
      categoriesStore.customCategories,
      enginesStore.customEngines
    )

    // 实际写盘合并到下一次微任务窗口后执行，连续操作只写一次
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      flushSave()
    }, SAVE_DEBOUNCE_MS)
  }

  // 导出为 Markdown 文件
  /**
   * 导出导航站备份（全量）。
   * 内部复用 buildMarkdown + downloadMarkdown，与「按分类导出」共用同一套生成/打包逻辑。
   */
  async function exportToMarkdown() {
    const sortedSites = [...sites.value].sort((a, b) => {
      const sortA = a.sort ?? 1
      const sortB = b.sort ?? 1
      return sortB - sortA
    })
    const { markdown, iconTable } = await buildMarkdown(sortedSites)
    await downloadMarkdown(markdown, 'sites', iconTable)
  }

  /**
   * 按分类导出该分类下的站点（分类管理面板的「导出」按钮）。
   * 与全量导出**完全同一套生成/打包逻辑**，差别仅在于：
   * - 只导出传入分类下的站点（空分类导出空文件并提示）
   * - 只导出该分类自身一条 categories 记录（便于导入时归位），不带搜索引擎/密码/倒计时
   * - 文件名带分类名，如 `sites-work.md`
   */
  async function exportByCategory(categoryId: string, categoryName: string): Promise<number> {
    const catSites = sites.value
      .filter(s => s.category === categoryId)
      .sort((a, b) => {
        const sortA = a.sort ?? 1
        const sortB = b.sort ?? 1
        return sortB - sortA
      })
    const { markdown, iconTable } = await buildMarkdown(catSites, { onlyCategory: { id: categoryId, name: categoryName } })
    // 文件名净化：分类名可能含 / \ : 等非法字符
    const safe = (categoryName || 'category').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 30)
    // alwaysZip=true：分类导出恒为 .zip（含 icons/ 目录，与「备份恢复 → 导出」形态一致）
    await downloadMarkdown(markdown, `sites-${safe}`, iconTable, true)
    return catSites.length
  }

  /**
   * 把任意字符串转成 YAML 安全的标量（js-yaml 自动决定是否需要引号并正确转义）。
   * 导出站点/分类/密码等到 Markdown 时，字段值里可能含 `: `、`#`、开头 `*`/`-`/等
   * YAML 特殊字符，或形如 `2026-10-23T16:00` 会被 js-yaml 误解析成 Date 的串，
   * 不引号化就会写出非法 YAML → 导入时整段解析失败（报「未能解析到站点数据」）。
   * 统一走本函数即可保证导出文件可被原样解析回来。
   */
  function yamlStr(v: unknown): string {
    if (v === null || v === undefined) return "''"
    // forceQuotes: 即便值里含 `,` `: ` 等字符也强制加引号，保证在 flow 数组（tags）
    // 与块映射（description/name 等）里都不会被 YAML 误拆/误判。
    return yaml.dump(String(v), { forceQuotes: true }).trim()
  }

  /**
   * 生成 Markdown 文本（导出核心）。
   * @param targetSites 要写出的站点（调用方已排序）
   * @param opts.onlyCategory 非空时只写该分类一条 categories 记录、不写搜索引擎/密码/倒计时（按分类导出用）
   */
  async function buildMarkdown(
    targetSites: Site[],
    opts: { onlyCategory?: { id: string; name: string } } = {}
  ): Promise<{ markdown: string; iconTable: ReturnType<typeof createIconNameTable> }> {
    const categoriesStore = useCategoriesStore()
    const enginesStore = useSearchEnginesStore()
    const passwordsStore = usePasswordsStore()
    const countdownsStore = useCountdownsStore()

    // 站点图标本地化：base64 图标不进 Markdown，改为写入 ZIP 内 icons/ 目录，
    // Markdown 只留相对路径（icons/xxx.png），导出文件可读、体积小；
    // 导入时（importFromMarkdown）会把相对路径还原回 base64，站点数据照常入库。
    const iconTable = createIconNameTable()
    const sitesList = targetSites.map((site, i) => {
      const iconPath = site.icon ? registerIconPath(iconTable, site.icon, site.name, i) : ''
      return `  - name: ${yamlStr(site.name)}
    url: ${yamlStr(site.url)}
    description: ${yamlStr(site.description || '')}
    category: ${yamlStr(site.category)}
    tags: [${site.tags.map(t => yamlStr(t)).join(', ')}]
    icon: ${yamlStr(iconPath)}
    sort: ${site.sort || 0}
    createdAt: ${yamlStr(site.createdAt || '')}`
    }).join('\n\n')

    // 按分类导出：只保留该分类自身一条记录；全量导出：写出全部自定义分类（升序）
    let categoriesSection: string
    if (opts.onlyCategory) {
      const c = opts.onlyCategory
      categoriesSection = `categories:\n  - id: ${yamlStr(c.id)}\n    name: ${yamlStr(c.name)}\n    icon: ''\n    sort: 0\n\n`
    } else {
      const customCats = categoriesStore.exportCustomCategories()
      const sortedCats = [...customCats].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      // 分类图标与站点图标共用 iconTable：data URL 本地化为 icons/ 相对路径并随 ZIP 导出；
      // emoji / 预置路径 / http 地址非 data URL，registerIconPath 会原样保留。
      categoriesSection = sortedCats.length > 0
        ? `categories:\n${sortedCats.map((c: { id: string; name: string; icon: string; sort?: number }, idx: number) => `  - id: ${yamlStr(c.id)}\n    name: ${yamlStr(c.name)}\n    icon: ${yamlStr(c.icon ? registerIconPath(iconTable, c.icon, c.name, idx) : '')}\n    sort: ${c.sort || 0}`).join('\n\n')}\n\n`
        : ''
    }

    // 按分类导出不带搜索引擎/密码/倒计时（这些与分类无关，且密码属敏感信息不应随分类外流）
    const enginesSection = opts.onlyCategory
      ? ''
      : (() => {
          const engines = enginesStore.exportEngines()
          const sortedEngines = [...engines].sort((a, b) => a.sort - b.sort)
          return `searchEngines:\n${sortedEngines.map((e: { id: string; name: string; url: string; isDefault: boolean; sort: number }) => `  - id: ${yamlStr(e.id)}\n    name: ${yamlStr(e.name)}\n    url: ${yamlStr(e.url)}\n    isDefault: ${e.isDefault}\n    sort: ${e.sort}`).join('\n\n')}\n\n`
        })()

    // 导出密码 - 加密存储（按分类导出时跳过）
    let passwordsSection = ''
    if (!opts.onlyCategory && passwordsStore.isUnlocked) {
      const encryptedPasswords = await passwordsStore.exportEncryptedPasswords()
      if (encryptedPasswords.length > 0) {
        passwordsSection = `passwords:\n${encryptedPasswords.map(p => `  - id: ${yamlStr(p.id)}\n    siteName: ${yamlStr(p.siteName)}\n    url: ${yamlStr(p.url)}\n    username: ${yamlStr(p.username)}\n    password: ${yamlStr(p.password)}\n    createdAt: ${yamlStr(p.createdAt)}\n    updatedAt: ${yamlStr(p.updatedAt)}`).join('\n\n')}\n\n`
      }
    }

    // 导出倒计时（按分类导出时跳过）
    const countdownsSection = (!opts.onlyCategory && countdownsStore.countdowns.length > 0)
      ? `countdowns:\n${countdownsStore.countdowns.map(c => {
          const repeatBlock = serializeRepeatYaml(c.repeat)
          const repeatPrefix = repeatBlock ? '\n' : ''
          const categoryLine = `\n    category: ${yamlStr(c.category ?? 'work')}`
          const colorLine = c.color ? `\n    color: ${yamlStr(c.color)}` : ''
          const lastRemindedLine = c.lastRemindedAt ? `\n    lastRemindedAt: ${yamlStr(c.lastRemindedAt)}` : ''
          const sortOrderLine = typeof c.sortOrder === 'number' ? `\n    sortOrder: ${c.sortOrder}` : ''
          const showOnDisplayLine = c.showOnDisplay === false ? '\n    showOnDisplay: false' : ''
          const emailReminderLine = c.emailReminder === true ? '\n    emailReminder: true' : ''
          return `  - id: ${yamlStr(c.id)}\n    name: ${yamlStr(c.name)}\n    endDateTime: ${yamlStr(c.endDateTime)}${repeatPrefix}${repeatBlock}${categoryLine}${colorLine}${lastRemindedLine}${sortOrderLine}${showOnDisplayLine}${emailReminderLine}\n    createdAt: ${yamlStr(c.createdAt)}\n    updatedAt: ${yamlStr(c.updatedAt)}`
        }).join('\n\n')}\n\n`
      : ''

    const heading = opts.onlyCategory ? '分类书签' : '我的书签'
    const sub = opts.onlyCategory
      ? `「${opts.onlyCategory.name}」分类下的网站`
      : '个人常用的网站导航'

    const markdown = `---
${categoriesSection}${enginesSection}${passwordsSection}${countdownsSection}sites:
${sitesList}
---

# ${heading}

${sub}
`
    return { markdown, iconTable }
  }

  /**
   * 下载 Markdown：无自定义图标时导出单个 .md；有图标则打包 ZIP（<baseName>.md + icons/*）。
   * @param iconTable buildMarkdown 产出的图标注册表（相对路径 → data URL）
   * @param alwaysZip 强制 ZIP（分类导出用）：即��无图标也打成 ZIP，保持"分类导出恒为 zip"的稳定形态，
   *                   导入侧 importFromZip 本就同时兼容「有/无 icons 目录」的 ZIP，故行为一致
   */
  async function downloadMarkdown(
    markdown: string,
    baseName: string,
    iconTable: ReturnType<typeof createIconNameTable>,
    alwaysZip = false
  ): Promise<void> {
    const mdName = `${baseName}.md`
    const iconEntries = iconPathEntries(iconTable)
    if (iconEntries.length === 0 && !alwaysZip) {
      // 无自定义图标且未强制 ZIP：保持原行为，直接导出单个 Markdown
      downloadFileBlob(mdName, new Blob([markdown], { type: 'text/markdown' }))
      return
    }
    // 有自定义图标（或强制 ZIP）：打包成 ZIP（md + icons/*），Markdown 内为相对路径
    const zip = new JSZip()
    zip.file(mdName, markdown)
    for (const { dataUrl, path } of iconEntries) {
      const parsed = parseDataUrl(dataUrl)
      if (!parsed) continue
      zip.file(path, base64ToBytes(parsed.base64))
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    downloadFileBlob(`${baseName}.zip`, zipBlob)
  }

  /**
   * 从导出的 ZIP 导入（sites.md + icons/*）：
   * 先解析出结构化数据，再把 icon 里的**相对路径按图标文件结构化还原**为 data URL。
   *
   * 为什么不再对 Markdown 文本做字符串替换：
   * 文本替换依赖「Markdown 里写成什么样」，对引号风格（`'x'` / `"x"` / 裸值）、
   * 路径层级（`icons/x` vs `xxx/icons/x`）、Windows 反斜杠、替换先后顺序都很脆弱，
   * 任意一处对不上就整批图标丢失。改成解析后按 `icon` 值匹配图标文件，稳定性高得多。
   */
  async function importFromZip(file: File): Promise<{
    added: number
    skipped: number
    passwordsImported?: number
    error?: string
    iconsRestored?: number
    iconsMissing?: string[]
    iconsFilled?: number
    iconLibraryAdded?: number
    iconLibraryError?: string
  }> {
    let mdText = ''
    const iconFiles: Record<string, IconFileEntry> = {}
    try {
      const zip = await JSZip.loadAsync(file)
      const names = Object.keys(zip.files)
      // Markdown 可能在根目录，也可能被包在一层同名目录里（`xxx/sites.md`）
      const mdName = names.find((n) => /\.md$/i.test(n) && !zip.files[n].dir)
      if (!mdName) return { added: 0, skipped: 0, error: '压缩包内未找到 .md 备份文件' }
      mdText = await zip.files[mdName].async('string')
      // 图标文件：兼容根目录 `icons/x.png`、带前缀 `xxx/icons/x.png`、反斜杠分隔符
      for (const n of names) {
        if (zip.files[n].dir) continue
        if (!/icons[\\/][^\\/]+$/i.test(n)) continue
        const buf = await zip.files[n].async('uint8array')
        iconFiles[n] = { mime: mimeOfPath(n), base64: bytesToBase64(buf) }
      }
    } catch (e) {
      return { added: 0, skipped: 0, error: '无法读取压缩包：' + (e as Error).message }
    }

    const { parseSitesFromMarkdown } = useMarkdown()
    const parsed = parseSitesFromMarkdown(mdText)
    const { restored, missing } = resolveIconFilesInParsed(parsed, iconFiles)
    if (missing.length > 0) {
      // 说明 ZIP 里确实缺这些图标文件：保留原相对路径（至少不崩），并把清单打到控制台便于排查
      console.warn(
        `[Import] ${missing.length} 个图标在压缩包中找不到对应文件，已保留原路径：`,
        missing.slice(0, 20)
      )
    }
    const res = await applyParsedData(parsed)

    // 把 ZIP 里的图标同时登记进「图标库」（自定义图标）。
    // 否则导入后站点上有图，但「设置 → 图标管理」仍显示「自定义 0 个」，
    // 用户想给其它站点复用这些图标时无从选择。
    // 放在站点落库之后：即便图标库写入失败（配额等），站点导入本身不受影响。
    let iconLibraryAdded = 0
    let iconLibraryError = ''
    try {
      const iconsStore = useIconsStore()
      const entries = Object.entries(iconFiles).map(([p, v]) => ({
        name: iconDisplayName(p),
        dataUrl: `data:${v.mime};base64,${v.base64}`,
        category: '其他'
      }))
      const lib = await iconsStore.importIconEntries(entries)
      iconLibraryAdded = lib.added
    } catch (e) {
      iconLibraryError = e instanceof Error ? e.message : String(e ?? '')
      console.warn('[Import] 图标库登记失败（站点导入已成功，不受影响）：', e)
    }

    return { ...res, iconsRestored: restored, iconsMissing: missing, iconLibraryAdded, iconLibraryError }
  }

  // 从 Markdown 文本导入（旧版单 .md 备份 / 用户直接拖入 .md）：无法还原图标文件，仅做提示
  async function importFromMarkdown(markdownText: string): Promise<{ added: number; skipped: number; passwordsImported?: number; error?: string; iconsFilled?: number }> {
    const { parseSitesFromMarkdown } = useMarkdown()
    const parsed = parseSitesFromMarkdown(markdownText)
    // 若 .md 里引用了 `icons/xxx` 相对路径，说明它本来是 ZIP 的一部分；
    // 单文件导入拿不到图标字节 → 明确提示改用 .zip，避免用户以为「图标莫名丢了」。
    const leftover = [...(parsed.sites || []), ...(parsed.categories || [])].filter((x) =>
      isRelativeIconPath((x as { icon?: string }).icon)
    )
    if (leftover.length > 0) {
      console.warn(
        `[Import] 检测到 ${leftover.length} 个相对图标路径，但当前导入的是 .md 单文件（不含图标文件）。` +
          '请改为导入完整的 .zip 备份以还原这些图标。'
      )
    }
    return applyParsedData(parsed)
  }

  /** 把已解析的数据落库（Markdown 文本导入与 ZIP 导入共用同一套逻辑）。 */
  async function applyParsedData(
    parsed: ReturnType<ReturnType<typeof useMarkdown>['parseSitesFromMarkdown']>
  ): Promise<{ added: number; skipped: number; passwordsImported?: number; error?: string; iconsFilled?: number }> {
    const importedSites = parsed.sites
    
    // 检查是否解析到站点数据
    if (!importedSites || importedSites.length === 0) {
      return { added: 0, skipped: 0, error: '未能在文件中解析到站点数据，请检查文件格式是否正确' }
    }
    
    // 过滤掉无效的 URL
    const validSites = importedSites.filter(site => site.url && site.url.trim() !== '')
    if (validSites.length === 0) {
      console.error('[Import] All sites have empty URLs')
      return { added: 0, skipped: 0, error: '文件中所有站点都缺少有效的 URL' }
    }
    
    // 导入自定义分类
    if (parsed.categories && parsed.categories.length > 0) {
      const categoriesStore = useCategoriesStore()
      categoriesStore.importCategories(parsed.categories)
    }
    
    // 导入倒计时（按 id 去重，保留原有数据，持久层在 countdowns store 内处理）
    if (parsed.countdowns && parsed.countdowns.length > 0) {
      const countdownsStore = useCountdownsStore()
      const cdResult = await countdownsStore.importCountdowns(parsed.countdowns)
      console.log(`[Import] 倒计时：导入 ${cdResult.imported} 条，跳过 ${cdResult.skipped} 条`)
    }
    
    // 获取现有的 nav store 数据
    // 这里同样不能依赖外层 catch：user-sites 解析失败时若继续往下走，
    // 最终会把「只含本次导入站点」的新列表覆盖掉损坏的原数据 → 原数据彻底找不回来。
    const existingData = getPref('user-sites')
    let existingSites: Site[] = []
    if (existingData) {
      try {
        const parsedExisting: unknown = JSON.parse(existingData)
        existingSites = Array.isArray(parsedExisting) ? (parsedExisting as Site[]) : []
      } catch (e) {
        console.error('[sites] user-sites 内容损坏，已中止导入以保留原数据', e)
        return {
          added: 0,
          skipped: 0,
          error: '本地站点数据疑似损坏，为保障可恢复性已中止本次导入。请先「备份恢复」或导出后再导入。'
        }
      }
    }

    // 建立 URL 到站点的映射（只检查 nav store 中的用户数据）
    const existingMap = new Map(existingSites.map(s => [s.url, s]))

    let added = 0
    let skipped = 0
    let iconsFilled = 0

    // 合并数据：新数据中 URL 不存在的才添加
    for (const site of validSites) {
      const exist = existingMap.get(site.url)
      if (!exist) {
        existingSites.push(site)
        existingMap.set(site.url, site)
        added++
      } else {
        skipped++
        // 已存在：不覆盖原有字段，但**补齐/修复图标**。
        // 典型场景：此前导入过同一份数据，当时图标未还原（icon 为空或残留 icons/xxx 相对路径），
        // 现在重新导入带图标的 ZIP —— 若「跳过」时什么都不做，刚还原好的图标就被整包丢掉了。
        if (shouldFillIcon(exist.icon, site.icon)) {
          exist.icon = site.icon
          iconsFilled++
        }
      }
    }

    // 保存到 nav store（立即落盘，确保 loadSites 重载前已持久）
    // 导入是显式操作且只会变多：先推进基线，避免「导入更大数据却被守卫拦下」
    noteExplicitMutation()
    // 必须 await：setPrefNow 的 IDB 写入本身是异步的，而导入携带大量 base64 图标，
    // 若写入还没完成用户就刷新页面，这次大体积写入可能被中断 → 表现为「刷新后图标消失」。
    await setPrefNow('user-sites', JSON.stringify(existingSites))
    // 必须标脏：其它所有改动都走 saveUserSites()（内部 markDirty），只有导入这条漏了。
    // 不标脏的话，刷新页面触发 visibilitychange → pullNow 会认为本地「不脏」，
    // 直接用远端旧数据覆盖回来，刚补齐的图标又变回 icons/xxx 相对路径。
    if (added > 0 || iconsFilled > 0) markDirty()

    // 重新加载数据以更新显示
    loadSites()
    
    return { added, skipped, iconsFilled }
  }

  return {
    sites,
    visibleSites,
    searchQuery,
    selectedTags,
    selectedCategory,
    isLoading,
    allCategories,
    allTags,
    tagsByCategory,
    filteredSites,
    sitesByCategory,
    currentPage,
    pageSize,
    totalPages,
    paginatedSites,
    loadSites,
    addSite,
    updateSite,
    deleteSite,
    unmarkInvalid,
    migrateSitesToCategory,
    setSearchQuery,
    toggleTag,
    setCategory,
    setPage,
    setPageSize,
    clearFilters,
    exportToMarkdown,
    exportByCategory,
    importFromMarkdown,
    importFromZip,
    // 断链检测
    isCheckingLinks,
    linkCheckProgress,
    linkCheckSummary,
    showOnlyInvalid,
    invalidCount,
    checkDeadLinks: checkDeadLinksAction,
    stopLinkCheck: stopLinkCheckAction,
    // 拖拽排序
    swapSort,
    // 点击频率排序
    incrementClick,
    // 数据降级保护状态（空串 = 正常；非空 = 已暂停回写的原因）
    dataGuardMessage
  }
})

// ============================================================
// 导出辅助（纯函数，零依赖）
// ============================================================

/** 触发浏览器下载（导航站无通用下载工具，就地内联保持与既有代码一致） */
function downloadFileBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * base64 字符串 → Uint8Array（导出图标为真实图片文件时用）。
 * 用 atob 先解成二进制串再逐字符取 charCodeAt；避免对超长串直接 apply 造成爆栈。
 */
function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** 文件路径 → mime（导入 ZIP 时给还原出的图标字节配 data URL 的 mime） */
function mimeOfPath(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase()
  switch (ext) {
    case 'svg': return 'image/svg+xml'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'ico': return 'image/x-icon'
    case 'bmp': return 'image/bmp'
    default: return 'image/png'
  }
}

/** Uint8Array → base64（分块转换，避免大图标 String.fromCharCode 爆栈） */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[])
  }
  return btoa(bin)
}
