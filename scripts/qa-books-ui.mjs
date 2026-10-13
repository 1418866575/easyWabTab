/**
 * 个人图书馆（/books）浏览器目视验证
 *
 * 复用本机已装 chromium（不重新下载），桌面 + 移动视口各跑一遍。
 * 重点验证：书架渲染 / 搜索 / 分类 / 收藏 / 最近阅读 / 站内阅读 iframe / 阅读位置书签 / 上传。
 *
 * 用法：node scripts/qa-books-ui.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const BASE = process.argv[2] || 'http://127.0.0.1:16731'
const OUT = path.join(process.cwd(), 'qa-books')
fs.mkdirSync(OUT, { recursive: true })

/** 找本机已装 chromium：优先 playwright 缓存目录 */
function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  const dirs = fs
    .readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: findChromium() })

// ---------- 桌面视口 ----------
{
  // 每个视口用**独立的 storageState 隔离**偏好，而不是在同一 context 里删库。
  //
  // 踩过的坑：原先用 indexedDB.deleteDatabase 清残留，但 SPA 页面仍持有连接，
  // 会触发 onblocked → Promise 提前 resolve（库其实没删掉），reload 后状态不确定，
  // 表现为「书签断言时灵时不灵」。删库不是可靠的状态隔离手段。
  // playwright 默认每个 newContext 就是全新的存储，天然干净。
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: { cookies: [], origins: [] }
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`${BASE}/books`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid^="bk-card-"]', { timeout: 15000 })

  // 顶部栏：左上角工作台切换（图标 + 名称），点击弹面板可跳其它页面
  const topbar = await page.locator('.bk-topbar').count()
  check('桌面：顶部栏渲染', topbar === 1)
  const trigger = page.locator('.bk-topbar .ws-trigger')
  check('桌面：顶栏含工作台切换触发器', (await trigger.count()) === 1)
  const triggerText = await trigger.innerText()
  check(
    '桌面：触发器显示图书馆名称',
    /图书馆/.test(triggerText),
    triggerText.trim().replace(/\s+/g, ' ')
  )
  // 顶栏要通栏（在 .bk-shell 限宽容器之外），否则与内容区不对齐
  const barFull = await page.evaluate(() => {
    const bar = document.querySelector('.bk-topbar')
    const shell = document.querySelector('.bk-shell')
    if (!bar || !shell) return null
    const b = bar.getBoundingClientRect()
    const s = shell.getBoundingClientRect()
    return { barX: Math.round(b.left), barW: Math.round(b.width), shellX: Math.round(s.left), shellW: Math.round(s.width) }
  })
  check(
    '桌面：顶栏通栏（不受内容区限宽影响）',
    !!barFull && barFull.barX < barFull.shellX && barFull.barW > barFull.shellW,
    JSON.stringify(barFull)
  )
  // 点击应弹出命令面板且列出导航站等入口
  await trigger.click()
  const panelVisible = await page
    .waitForSelector('[data-testid="ws-panel"]', { timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  check('桌面：点击触发器弹出切换面板', panelVisible)
  if (panelVisible) {
    const itemCount = await page.locator('.ws-item').count()
    check('桌面：面板列出各工作台入口', itemCount >= 5, `${itemCount} 个入口`)
    // 图书馆自身应标记为「当前」（模板里是 .ws-item.current）
    const currentCount = await page.locator('.ws-item.current').count()
    const currentName = currentCount
      ? await page.locator('.ws-item.current .ws-item-name').first().innerText()
      : ''
    check(
      '桌面：面板内把图书馆标记为当前页',
      currentCount === 1 && /图书馆/.test(currentName),
      `当前项「${currentName.trim()}」×${currentCount}`
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-testid="ws-panel"]', { state: 'detached', timeout: 5000 })
  }

  // 书架固定卡片视图（用户 2026-10-13 要求移除列表视图）：
  // 既要确认卡片渲染出来，也要确认页面上**不再有**视图切换按钮。
  const cardCount = await page.locator('[data-testid^="bk-card-"]').count()
  check('桌面：书架渲染出书籍卡片', cardCount >= 4, `${cardCount} 张卡片`)

  const viewToggle = await page.locator('[data-testid="bk-view-toggle"]').count()
  check('桌面：无视图切换按钮（固定卡片视图）', viewToggle === 0, `残留 ${viewToggle} 个`)

  const listContainers = await page.locator('.bk-list').count()
  check('桌面：无列表视图容器', listContainers === 0, `残留 ${listContainers} 个`)

  // 计数与排序说明现在都在「全部书籍」分区头的副标题里（与工具箱一致）：
  // 形如「4 本 · 按最近打开排序」
  const headSub = await page.locator('.bk-section-sub').first().innerText()
  check('桌面：分区头显示数量与排序说明', /\d+ 本 · 按.+排序/.test(headSub), headSub.trim())

  // 页面横向溢出检查（移动端最易出问题，桌面顺手一起看）
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  check('桌面：页面无横向溢出', overflow <= 1, `溢出 ${overflow}px`)

  // 分类页签（药丸形态：图标 + 名称 + 数量徽标，选中态实底）
  // 注意选择器是 .bk-tab 不是 .bk-cat —— 卡片内部也有 .bk-cat（分类徽标），
  // 用错类名会把卡片徽标一起数进来，让页签数量虚高一倍（实测过：4 个页签数成 8 个）。
  const tabs = page.locator('.bk-tabs .bk-tab')
  const catCount = await tabs.count()
  check('桌面：分类页签渲染', catCount >= 2, `${catCount} 个页签`)
  const allTabText = await page.locator('[data-testid="bk-tab-all"]').innerText()
  check('桌面：「全部」页签带数量徽标', /\d/.test(allTabText), allTabText.trim())
  const tabRadius = await page.locator('[data-testid="bk-tab-all"]').evaluate(
    (el) => getComputedStyle(el).borderRadius
  )
  check('桌面：页签为药丸形态（圆角边框）', tabRadius.includes('9999'), tabRadius)

  // 「全部」选中态应为实底主色（工具箱同款）
  const tabBg = await page.locator('[data-testid="bk-tab-all"]').evaluate(
    (el) => getComputedStyle(el).backgroundColor
  )
  check('桌面：「全部」页签默认选中（实底）', tabBg !== 'rgba(0, 0, 0, 0)', tabBg)

  // 类名撞车回归防线：页签容器下的 .bk-tab 数量必须等于有 data-testid 的页签数。
  // 若哪天页签又改回 .bk-cat，卡片内的 .bk-cat 徽标会被一起选中，count 翻倍。
  const tabTestIds = await page.locator('.bk-tab[data-testid]').count()
  check(
    '桌面：页签选择器未与卡片徽标撞车',
    tabTestIds === catCount,
    `.bk-tab=${catCount}，带 testid=${tabTestIds}`
  )

  // 搜索过滤：书名过滤后卡片应只剩 1 张
  await page.locator('[data-testid="bk-search"]').fill('道德经')
  await page.waitForTimeout(700)
  const cardsAfterSearch = await page.locator('[data-testid^="bk-card-"]').count()
  check('桌面：搜索能过滤', cardsAfterSearch === 1, `剩 ${cardsAfterSearch} 张卡片`)
  await page.locator('[data-testid="bk-search"]').fill('')
  await page.waitForTimeout(600)

  // 排序下拉存在
  const sortOpts = await page.locator('[data-testid="bk-sort"] option').count()
  check('桌面：排序选项齐全', sortOpts >= 5, `${sortOpts} 个选项`)

  // 收藏：点星标 → 出现「我的收藏」分区
  await page.locator('[data-testid="bk-star-daodejing"]').click()
  await page.waitForTimeout(400)
  const favVisible = await page.locator('[data-testid="bk-fav-section"]').count()
  check('桌面：收藏后出现「我的收藏」分区', favVisible === 1)

  // 最近阅读：进站内阅读页
  await page.locator('[data-testid="bk-read-daodejing"]').first().click()
  await page.waitForURL(/\/books\/read/, { timeout: 10000 })
  await page.waitForSelector('[data-testid="bk-reader-frame"]', { timeout: 10000 })
  check('桌面：站内阅读页路由跳转正确', page.url().includes('id=daodejing'))

  // iframe 真的加载出了内容
  // 用轮询等正文出现，不靠固定 sleep：书是 300KB+ 的大文件，机器慢时 2.5s 未必够
  const frameReady = await page
    .waitForFunction(
      () => {
        const f = document.querySelector('[data-testid="bk-reader-frame"]')
        try {
          const d = f?.contentDocument
          return !!d && !!d.body && d.body.innerText.length > 50
        } catch {
          return false
        }
      },
      { timeout: 20000 }
    )
    .then(() => true)
    .catch(() => false)
  check('桌面：iframe 内同源可读（原书内容已渲染）', frameReady)

  // 滚到底 → 书签应被记录。
  //
  // ⚠️ 两个坑，都踩过：
  // 1. 不能只滚 window：道德经这类书正文在**内部滚动容器**里
  //    （实测 documentElement 849/849 不可滚，正文在 nav.toc-sidebar 4518/809），
  //    滚 window 什么都不会发生。
  // 2. 不能只在 evaluate 里设 scrollTop：程序化赋值**不触发 scroll 事件**，
  //    而阅读页靠 scroll 事件 + 800ms 空闲计时存书签 → 会得到假阴性。
  //    mouse.wheel 也不行：那个容器在侧边栏，不在 iframe 中心，滚轮落不上去。
  // 所以这里显式 dispatchEvent('scroll') 模拟「用户滚动了」这个事实 ——
  // 被测的是应用收到事件后能否正确记录书签，触发手段本身不是被测对象。
  const located = await page.evaluate(() => {
    const w = document.querySelector('[data-testid="bk-reader-frame"]')?.contentWindow
    if (!w) return { found: false }
    const de = w.document.documentElement
    if (de.scrollHeight - de.clientHeight > 8) return { found: true, via: 'window' }
    let best = -1
    for (const el of w.document.querySelectorAll('*')) {
      if (el.scrollHeight - el.clientHeight <= 8) continue
      const oy = w.getComputedStyle(el).overflowY
      if (oy !== 'auto' && oy !== 'scroll') continue
      const r = el.getBoundingClientRect()
      const area = r.width * r.height
      if (area > best) best = area
    }
    return { found: best > 0, via: 'inner' }
  })
  check('桌面：iframe 内定位到可滚动容器', located.found, JSON.stringify(located))

  const reached = await page.evaluate(() => {
    const w = document.querySelector('[data-testid="bk-reader-frame"]')?.contentWindow
    if (!w) return { ok: false }
    const de = w.document.documentElement
    if (de.scrollHeight - de.clientHeight > 8) {
      w.scrollTo(0, de.scrollHeight)
      w.dispatchEvent(new Event('scroll'))
      return { ok: w.scrollY > 50, via: 'window', scrollY: w.scrollY }
    }
    let t = null
    let best = -1
    for (const el of w.document.querySelectorAll('*')) {
      if (el.scrollHeight - el.clientHeight <= 8) continue
      const oy = w.getComputedStyle(el).overflowY
      if (oy !== 'auto' && oy !== 'scroll') continue
      const r = el.getBoundingClientRect()
      const area = r.width * r.height
      if (area > best) { best = area; t = el }
    }
    if (!t) return { ok: false }
    t.scrollTop = t.scrollHeight
    t.dispatchEvent(new Event('scroll'))
    return { ok: t.scrollTop > 50, via: 'inner', scrollTop: t.scrollTop }
  })
  check('桌面：模拟滚动到底并派发 scroll 事件', reached.ok, JSON.stringify(reached))

  // 等书签记录：scroll 事件 → 800ms 空闲计时 → 300ms 防抖落盘 → Vue 渲染
  // 用轮询而非固定 sleep（这三段都是定时器，机器慢时叠加起来会超过任何写死的值）
  const bookmarkRecorded = await page
    .waitForSelector('[data-testid="bk-reader-progress"]', { timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  check('桌面：滚动后自动记录阅读位置', bookmarkRecorded)

  await page.screenshot({ path: path.join(OUT, 'reader-desktop.png'), fullPage: false })

  // 回书架：刚读过的那本书卡片上应显示进度。
  // 用精确 id 断言，不能用前缀匹配（会数到已被去重移出主区的卡片）。
  await page.locator('[data-testid="bk-reader-back"]').click()
  await page.waitForURL(/\/books$/, { timeout: 10000 })
  await page.waitForTimeout(1200)
  const cardProgress = await page.locator('[data-testid="bk-progress-daodejing"]').count()
  check('桌面：回书架后卡片显示阅读进度', cardProgress >= 1, `${cardProgress} 处进度`)

  // 同一本书不能同时出现在收藏 / 最近阅读 / 全部书籍三个分区里
  const dupe = await page.evaluate(() => {
    const seen = new Map()
    const dupes = []
    for (const sec of document.querySelectorAll('.bk-section')) {
      for (const el of sec.querySelectorAll('[data-testid^="bk-card-"]')) {
        const id = el.getAttribute('data-testid').replace('bk-card-', '')
        if (seen.has(id)) dupes.push(`${id} 同时出现在「${seen.get(id)}」与另一分区`)
        else seen.set(id, sec.querySelector('.bk-section-title')?.textContent?.trim() ?? '?')
      }
    }
    return dupes
  })
  check('桌面：同一本书不在多个分区重复出现', dupe.length === 0, dupe.slice(0, 3).join(' | '))

  // 上传弹框能打开
  await page.locator('[data-testid="bk-open-upload"]').click()
  await page.waitForTimeout(600)
  const dlg = await page.locator('[data-testid="bk-dropzone"]').count()
  check('桌面：上传弹框可打开', dlg === 1)
  await page.screenshot({ path: path.join(OUT, 'upload-dialog.png') })
  await page.locator('[data-testid="bk-upload-close"]').click()
  await page.waitForSelector('[data-testid="bk-dropzone"]', { state: 'detached', timeout: 5000 })
  // 遮罩必须彻底消失 —— 它是 position:fixed 铺满视口的，残留会拦截全页点击
  const overlayLeft = await page.locator('.bd-overlay').count()
  check('桌面：弹框关闭后遮罩完全卸载', overlayLeft === 0, `残留 ${overlayLeft} 个遮罩`)

  // 刷新后偏好应保持（收藏 / 最近阅读 / 打开次数）。
  // 断言直接读 IDB 里的 books-prefs，**不要**依赖分区是否可见 ——
  // 本轮流程里道德经已被收藏，「最近阅读」分区会被去重逻辑隐藏，
  // 拿分区数当持久化的证据会把「去重生效」误报成「最近阅读丢了」。
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const persisted = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('easy-web-tab')
        req.onsuccess = () => {
          try {
            const st = req.result.transaction('nav', 'readonly').objectStore('nav')
            const kq = st.get('books-prefs')
            kq.onsuccess = () => {
              try {
                resolve(kq.result ? JSON.parse(kq.result) : null)
              } catch (e) {
                resolve({ parseError: String(e) })
              }
            }
            kq.onerror = () => resolve(null)
          } catch (e) {
            resolve(null)
          }
        }
        req.onerror = () => resolve(null)
        setTimeout(() => resolve(null), 4000)
      })
  )
  check(
    '桌面：刷新后收藏保持',
    !!persisted && Array.isArray(persisted.favorites) && persisted.favorites.includes('daodejing'),
    JSON.stringify(persisted?.favorites)
  )
  check(
    '桌面：刷新后最近阅读保持',
    !!persisted && !!persisted.recent && persisted.recent.daodejing > 0,
    JSON.stringify(persisted?.recent)
  )
  check(
    '桌面：刷新后阅读书签保持',
    !!persisted && !!persisted.bookmarks && !!persisted.bookmarks.daodejing,
    JSON.stringify(persisted?.bookmarks?.daodejing)
  )
  // 分区展示：收藏区可见（daodejing 收藏）；最近阅读区因去重可隐藏，属预期
  const favAfterReload = await page.locator('[data-testid="bk-fav-section"]').count()
  check('桌面：刷新后「我的收藏」分区仍显示', favAfterReload === 1)

  await page.screenshot({ path: path.join(OUT, 'books-desktop.png'), fullPage: true })

  const realErrors = errors.filter((e) => !/favicon|404 \(Not Found\).*favicon/i.test(e))
  check('桌面：无 JS 控制台错误', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  // 回归守卫：用户 2026-10-13 要求删除「仅书签」按钮、把「重置统计」挪到右上角。
  // 1) 旧的「仅书签」药丸（bk-filter-mark）必须彻底消失，不能再出现
  const markChip = await page.locator('[data-testid="bk-filter-mark"]').count()
  check('桌面：已删除「仅书签」按钮', markChip === 0, `残留 ${markChip} 个`)
  // 2) 「重置统计」(`bk-reset-clicks`) 若可见，必须位于顶栏右侧 `.bk-topbar-right` 内，而非分区头
  const resetInTopbar = await page
    .locator('.bk-topbar-right [data-testid="bk-reset-clicks"]')
    .count()
  const resetAnywhere = await page.locator('[data-testid="bk-reset-clicks"]').count()
  check(
    '桌面：「重置统计」位于顶栏右上角',
    resetAnywhere === 0 || resetInTopbar === 1,
    `顶栏内 ${resetInTopbar} / 全局 ${resetAnywhere}`
  )

  // 云同步按钮（2026-10-14 新增）：右上角固定，仅收藏 + 用户书签经 books.json 进云同步。
  // QA 用全新 storageState（未配置云同步），按钮以弱化态（is-off）渲染但必须存在。
  const syncBtn = page.locator('.bk-topbar-right [data-testid="bk-books-sync-btn"]')
  check('桌面：云同步按钮固定于右上角', (await syncBtn.count()) === 1)

  // 书签按钮 + 添加流程（用户 2026-10-13 新增）：右上角固定按钮 → 弹框表单 → 确认添加
  const bmBtn = page.locator('.bk-topbar-right [data-testid="bk-open-bookmark"]')
  check('桌面：书签按钮固定于右上角', (await bmBtn.count()) === 1)
  await bmBtn.click()
  await page.waitForSelector('[data-testid="bk-bookmark-dialog"]', { timeout: 8000 })
  check(
    '桌面：点击书签按钮弹出添加对话框',
    (await page.locator('[data-testid="bk-bookmark-dialog"]').count()) === 1
  )
  // 书名为空时拦截
  await page.click('[data-testid="bk-bm-add"]')
  check(
    '桌面：书名为空时给出错误提示',
    (await page.locator('[data-testid="bk-bm-error"]').count()) === 1
  )
  // 填书名 + 内容 → 添加成功并出现在列表
  await page.fill('[data-testid="bk-bm-title"]', 'QA测试书')
  await page.fill('[data-testid="bk-bm-content"]', '一段自定义内容')
  await page.click('[data-testid="bk-bm-add"]')
  await page.waitForSelector('.bk-bm-item', { timeout: 8000 })
  check('桌面：添加后列表出现书签', (await page.locator('.bk-bm-item').count()) === 1)
  check(
    '桌面：书签按钮显示数量徽标',
    (await page.locator('[data-testid="bk-bookmark-count"]').count()) === 1
  )
  // 关闭弹框
  await page.click('[data-testid="bk-bm-close"]')
  await page.waitForSelector('[data-testid="bk-bookmark-dialog"]', { state: 'detached', timeout: 8000 })
  check('桌面：添加书签弹框可关闭', true)

  const realErrors2 = errors.filter((e) => !/favicon|404 \(Not Found\).*favicon/i.test(e))
  check('桌面：书签流程无 JS 控制台错误', realErrors2.length === 0, realErrors2.slice(0, 2).join(' | '))

  await ctx.close()
}

// ---------- 移动视口 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/books`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid^="bk-card-"]', { timeout: 15000 })
  await page.waitForTimeout(800)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  check('移动：无横向溢出', overflow <= 1, `溢出 ${overflow}px`)

  // 移动端同样是卡片视图，且本就不存在视图切换按钮（已整体移除）
  const toggleVisible = await page.locator('[data-testid="bk-view-toggle"]').count()
  check('移动：无视图切换按钮（固定卡片视图）', toggleVisible === 0)

  // 移动端顶栏：触发器仍须存在且可点（否则手机上没有任何离开本页的入口）
  const mTrigger = page.locator('.bk-topbar [data-testid="ws-trigger"]')
  check('移动：顶栏含工作台切换触发器', (await mTrigger.count()) === 1)
  const mTriggerH = await mTrigger
    .first()
    .boundingBox()
    .then((b) => (b ? Math.round(b.height) : 0))
  check('移动：顶栏触发器触控高度 ≥32px', mTriggerH >= 32, `${mTriggerH}px`)
  // 书签按钮在移动端同样固定于右上角且可点
  const mBm = page.locator('.bk-topbar-right [data-testid="bk-open-bookmark"]')
  check('移动：右上角有书签按钮', (await mBm.count()) === 1)
  // 云同步按钮在移动端同样固定于右上角
  const mSync = page.locator('.bk-topbar-right [data-testid="bk-books-sync-btn"]')
  check('移动：右上角有云同步按钮', (await mSync.count()) === 1)
  const mPanel = await mTrigger
    .first()
    .click()
    .then(() => page.waitForSelector('[data-testid="ws-panel"]', { timeout: 5000 }).then(() => true).catch(() => false))
  check('移动：点击触发器弹出切换面板', mPanel)
  if (mPanel) await page.keyboard.press('Escape')

  // 触控目标 ≥32px
  const smallTargets = await page.evaluate(() => {
    const sel = '[data-testid^="bk-star-"], [data-testid^="bk-open-"], [data-testid^="bk-read-"]'
    return Array.from(document.querySelectorAll(sel))
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { t: el.getAttribute('data-testid'), w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter((x) => x.w > 0 && x.h > 0 && (x.w < 32 || x.h < 32))
  })
  check('移动：触控目标不小于 32px', smallTargets.length === 0, JSON.stringify(smallTargets.slice(0, 3)))

  await page.screenshot({ path: path.join(OUT, 'books-mobile.png'), fullPage: true })

  // 阅读页移动端
  await page.locator('[data-testid="bk-read-daodejing"]').first().click()
  await page.waitForURL(/\/books\/read/, { timeout: 10000 })
  await page.waitForTimeout(2000)
  const frameBox = await page.locator('[data-testid="bk-reader-frame"]').boundingBox()
  check('移动：阅读页 iframe 有实际高度', !!frameBox && frameBox.height > 300, frameBox ? `${Math.round(frameBox.height)}px` : 'null')
  await page.screenshot({ path: path.join(OUT, 'reader-mobile.png') })

  await ctx.close()
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过，exit ${failed.length ? 1 : 0}`)
if (failed.length) {
  for (const f of failed) console.error(`  ✗ ${f.name} — ${f.detail}`)
  process.exit(1)
}
console.log(`截图已输出到 ${OUT}`)