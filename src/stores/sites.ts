import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import JSZip from 'jszip'
import type { Site } from '../types'
import { CATEGORIES } from '../types'
import { useMarkdown } from '../composables/useMarkdown'
import { serializeRepeatYaml } from '../composables/countdownCore'
import {
  createIconNameTable,
  registerIconPath,
  iconPathEntries,
  parseDataUrl
} from '../composables/siteIconPortability'
import { useCategoriesStore } from './categories'
import { useSearchEnginesStore } from './searchEngines'
import { usePasswordsStore } from './passwords'
import { useCountdownsStore } from '@/stores/countdowns'
import {
  checkDeadLinks,
  saveCheckResults,
  loadCheckResults,
  type CheckProgress
} from '../composables/useDeadLinkChecker'
import { scheduleAutoBackup } from '../composables/useBackup'
import { markDirty } from '@/composables/useCloudSync'
import { getPref, setPrefNow } from '@/composables/useNavPrefs'

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
  const showOnlyInvalid = ref(false)

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

    const urls = sites.value.map(s => s.url)

    const results = await checkDeadLinks(
      urls,
      (progress, result) => {
        linkCheckProgress.value = progress
        // 实时更新 site 的 isValid
        const idx = sites.value.findIndex(s => s.url === result.url)
        if (idx !== -1) {
          sites.value[idx] = { ...sites.value[idx], isValid: result.isValid }
        }
      },
      checkAbortController.signal
    )

    // 保存结果
    saveCheckResults(results)

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

    // 按 sort 字段降序排序（点击频率高的在前）
    return filtered.sort((a, b) => {
      const sortA = a.sort ?? 1
      const sortB = b.sort ?? 1
      return sortB - sortA
    })
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
        
        // 合并游戏到sites（避免重复）
        const existingUrls = new Set(sites.value.map(s => s.url))
        const newGames = gameSites.filter(g => !existingUrls.has(g.url))
        sites.value.push(...newGames)
      }
    } catch (e) {
      console.warn('Failed to load games manifest:', e)
    }
  }

  async function loadSites() {
    isLoading.value = true
    try {
      // 获取内置数据
      const response = await fetch('/data/sites.md')
      const content = await response.text()
      const { sites: builtInSites } = parseSitesFromMarkdown(content)

      // 从 nav store 读取用户站点
      const savedData = getPref('user-sites')
      const savedSites: Site[] = savedData ? JSON.parse(savedData) : []

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

      // 加载游戏清单
      await loadGames()

      // 应用保存的断链检测结果
      applySavedCheckResults()
    } catch (error) {
      console.error('Failed to load sites:', error)
      sites.value = []
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
      saveUserSites()
    }
  }

  function deleteSite(url: string) {
    sites.value = sites.value.filter(s => s.url !== url)
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
      setPrefNow('user-sites', JSON.stringify(sites.value))
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

  // 点击网站时增加 sort 值（使用频率排序）
  function incrementClick(url: string) {
    const site = sites.value.find(s => s.url === url)
    if (!site) return

    // sort 值加 1
    site.sort = (site.sort ?? 1) + 1

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
    await downloadMarkdown(markdown, `sites-${safe}`, iconTable)
    return catSites.length
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
      return `  - name: ${site.name}
    url: ${site.url}
    description: ${site.description || ''}
    category: ${site.category}
    tags: [${site.tags.join(', ')}]
    icon: ${iconPath}
    sort: ${site.sort || 0}
    createdAt: ${site.createdAt || ''}`
    }).join('\n\n')

    // 按分类导出：只保留该分类自身一条记录；全量导出：写出全部自定义分类（升序）
    let categoriesSection: string
    if (opts.onlyCategory) {
      const c = opts.onlyCategory
      categoriesSection = `categories:\n  - id: ${c.id}\n    name: ${c.name}\n    icon: ''\n    sort: 0\n\n`
    } else {
      const customCats = categoriesStore.exportCustomCategories()
      const sortedCats = [...customCats].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      categoriesSection = sortedCats.length > 0
        ? `categories:\n${sortedCats.map((c: { id: string; name: string; icon: string; sort?: number }) => `  - id: ${c.id}\n    name: ${c.name}\n    icon: ${c.icon}\n    sort: ${c.sort || 0}`).join('\n\n')}\n\n`
        : ''
    }

    // 按分类导出不带搜索引擎/密码/倒计时（这些与分类无关，且密码属敏感信息不应随分类外流）
    const enginesSection = opts.onlyCategory
      ? ''
      : (() => {
          const engines = enginesStore.exportEngines()
          const sortedEngines = [...engines].sort((a, b) => a.sort - b.sort)
          return `searchEngines:\n${sortedEngines.map((e: { id: string; name: string; url: string; isDefault: boolean; sort: number }) => `  - id: ${e.id}\n    name: ${e.name}\n    url: ${e.url}\n    isDefault: ${e.isDefault}\n    sort: ${e.sort}`).join('\n\n')}\n\n`
        })()

    // 导出密码 - 加密存储（按分类导出时跳过）
    let passwordsSection = ''
    if (!opts.onlyCategory && passwordsStore.isUnlocked) {
      const encryptedPasswords = await passwordsStore.exportEncryptedPasswords()
      if (encryptedPasswords.length > 0) {
        passwordsSection = `passwords:\n${encryptedPasswords.map(p => `  - id: ${p.id}\n    siteName: ${p.siteName}\n    url: ${p.url}\n    username: ${p.username}\n    password: ${p.password}\n    createdAt: ${p.createdAt}\n    updatedAt: ${p.updatedAt}`).join('\n\n')}\n\n`
      }
    }

    // 导出倒计时（按分类导出时跳过）
    const countdownsSection = (!opts.onlyCategory && countdownsStore.countdowns.length > 0)
      ? `countdowns:\n${countdownsStore.countdowns.map(c => {
          const repeatBlock = serializeRepeatYaml(c.repeat)
          const repeatPrefix = repeatBlock ? '\n' : ''
          const categoryLine = `\n    category: ${c.category ?? 'work'}`
          const colorLine = c.color ? `\n    color: ${c.color}` : ''
          const lastRemindedLine = c.lastRemindedAt ? `\n    lastRemindedAt: '${c.lastRemindedAt}'` : ''
          const sortOrderLine = typeof c.sortOrder === 'number' ? `\n    sortOrder: ${c.sortOrder}` : ''
          const showOnDisplayLine = c.showOnDisplay === false ? '\n    showOnDisplay: false' : ''
          const emailReminderLine = c.emailReminder === true ? '\n    emailReminder: true' : ''
          return `  - id: ${c.id}\n    name: ${c.name}\n    endDateTime: ${c.endDateTime}${repeatPrefix}${repeatBlock}${categoryLine}${colorLine}${lastRemindedLine}${sortOrderLine}${showOnDisplayLine}${emailReminderLine}\n    createdAt: ${c.createdAt}\n    updatedAt: ${c.updatedAt}`
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
   */
  async function downloadMarkdown(
    markdown: string,
    baseName: string,
    iconTable: ReturnType<typeof createIconNameTable>
  ): Promise<void> {
    const mdName = `${baseName}.md`
    const iconEntries = iconPathEntries(iconTable)
    if (iconEntries.length === 0) {
      // 无自定义图标：保持原行为，直接导出单个 Markdown
      downloadFileBlob(mdName, new Blob([markdown], { type: 'text/markdown' }))
      return
    }
    // 有自定义图标：打包成 ZIP（md + icons/*），Markdown 内为相对路径
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
   * 读出 Markdown，把其中 `icon: icons/xxx.png` 的相对路径**还原为 base64**，
   * 再走 markdown 导入流程。旧的单 .md 文件（icon 为 data URL）不受影响。
   */
  async function importFromZip(file: File): Promise<{ added: number; skipped: number; passwordsImported?: number; error?: string; iconsRestored?: number }> {
    let mdText: string
    let iconFiles: Record<string, { mime: string; base64: string }> = {}
    try {
      const zip = await JSZip.loadAsync(file)
      // Markdown 可能在根目录，也可能被包在一层同名目录里
      let mdEntry: JSZip.JSZipObject | null = null
      const names = Object.keys(zip.files)
      for (const n of names) {
        if (/\.md$/i.test(n) && !zip.files[n].dir) { mdEntry = zip.files[n]; break }
      }
      if (!mdEntry) return { added: 0, skipped: 0, error: '压缩包内未找到 .md 备份文件' }
      mdText = await mdEntry.async('string')
      for (const n of names) {
        if (zip.files[n].dir || !/^icons\//i.test(n)) continue
        const buf = await zip.files[n].async('uint8array')
        iconFiles[n] = { mime: mimeOfPath(n), base64: bytesToBase64(buf) }
      }
    } catch (e) {
      return { added: 0, skipped: 0, error: '无法读取压缩包：' + (e as Error).message }
    }

    // 把 Markdown 中的相对路径替换回 data URL（YAML 里按行替换，避免转义问题）
    let iconsRestored = 0
    let text = mdText
    for (const [path, v] of Object.entries(iconFiles)) {
      // 同时兼容 `icons/x.png` 与 `./icons/x.png` 两种写法
      for (const candidate of [path, './' + path]) {
        if (text.includes(candidate)) {
          text = text.split(candidate).join(`data:${v.mime};base64,${v.base64}`)
          iconsRestored += 1
        }
      }
    }
    const res = await importFromMarkdown(text)
    return { ...res, iconsRestored }
  }

  // 从 Markdown 文本导入到 localStorage（按 URL 去重，保留原来的）
  async function importFromMarkdown(markdownText: string): Promise<{ added: number; skipped: number; passwordsImported?: number; error?: string }> {
    const { parseSitesFromMarkdown } = useMarkdown()
    const parsed = parseSitesFromMarkdown(markdownText)
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
    const existingData = getPref('user-sites')
    const existingSites: Site[] = existingData ? JSON.parse(existingData) : []

    // 建立 URL 到站点的映射（只检查 nav store 中的用户数据）
    const existingMap = new Map(existingSites.map(s => [s.url, s]))

    let added = 0
    let skipped = 0

    // 合并数据：新数据中 URL 不存在的才添加
    for (const site of validSites) {
      if (!existingMap.has(site.url)) {
        existingSites.push(site)
        existingMap.set(site.url, site)
        added++
      } else {
        skipped++
      }
    }

    // 保存到 nav store（立即落盘，确保 loadSites 重载前已持久）
    setPrefNow('user-sites', JSON.stringify(existingSites))
    
    // 重新加载数据以更新显示
    loadSites()
    
    return { added, skipped }
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
    showOnlyInvalid,
    invalidCount,
    checkDeadLinks: checkDeadLinksAction,
    stopLinkCheck: stopLinkCheckAction,
    // 拖拽排序
    swapSort,
    // 点击频率排序
    incrementClick
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
