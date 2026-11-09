/**
 * QA：留言板「标题跑马灯 + 详情弹框」
 *
 * 断言：
 *  S1 无留言时不渲染；有留言时多条弹幕轨道、每条两组同构、高度 +200px、相位错开、
 *      标题分配覆盖全部留言且**名称不重复**、「留言速览」浮在左上角上边缘
 *  S2 单组宽度 >= 视口宽度（回绕不露空白）
 *  S3 所有轨道由右向左、同速匀速左移（按 34px/s 估算位移，线性、不重置）
 *  S4 鼠标移入任一标题项 → 全部轨道一起暂停；移出 → 从当前位置恢复
 *  S5 点击标题打开详情（标题/完整正文/色调/置顶/时间/ID），关闭后滚动与点击均正常
 *  S6 长标题省略显示
 *  S7 卡片列表原有布局与交互不受影响
 *  S8 暗色 / 375px 移动端无横向溢出、无页面级 JS 异常
 *
 * 用法：node scripts/qa-workbench-marquee.mjs
 *      BASE=http://localhost:16719 node scripts/qa-workbench-marquee.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const errs = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter(x => x.startsWith('chromium-') && !x.includes('headless')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true } catch { }
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}
async function isViteDevAt(port) {
  try {
    const res = await fetch('http://localhost:' + port + '/src/composables/useIdb.ts')
    if (!res.ok) return false
    if ((res.headers.get('content-type') || '').includes('text/html')) return false
    return (await res.text()).includes('idbExportAll')
  } catch { return false }
}
async function isPortFree(port) {
  try { const r = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1200) }); return !r.ok } catch { return true }
}
let server = null
async function ensureDevServer() {
  if (process.env.BASE) return process.env.BASE
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', () => {})
    server.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p) && await isViteDevAt(p)) return 'http://localhost:' + p
    server.kill(); server = null
  }
  throw new Error('no free port for dev server')
}

/** 灌 3 条留言：普通标题 / 超长标题 / 无标题（走正文摘要） */
async function seed(page) {
  await page.evaluate(async () => {
    const { useWorkbenchMessagesStore } = await import('/src/stores/workbenchMessages.ts')
    const s = useWorkbenchMessagesStore()
    await s.loadMessages()
    for (const m of [...s.messages]) await s.purgeMessage(m.id)
    await s.addMessage({ title: '周末提醒', content: '记得喝水\n这是第二行完整正文', color: 'primary' })
    await s.addMessage({ title: '一个非常非常非常长的留言标题用来验证省略号能正确生效并且不会撑破跑马灯容器', content: '长标题留言的正文', color: 'success' })
    await s.addMessage({ title: '', content: '没有标题的留言正文内容', color: 'default' })
  })
}

/**
 * 跑马灯元素持续平移，Playwright 的 hover/click 会一直等「element is stable」而超时。
 * 真实用户是把指针移到屏幕上某个坐标、由浏览器命中移动中的标题（命中后即暂停），
 * 故这里按 boundingBox 直接移动/点击坐标，绕开 actionability 检查。
 */
async function pointerForText(page, text) {
  // 标题持续平移，且循环副本可能已滚出视口：先挑一个当前确实落在视口内的同文本标题，
  // 再按坐标移动/点击，避免命中视口外的元素导致 hover 不触发、click 落空。
  const p = await page.evaluate((t) => {
    const vp = document.querySelector('[data-testid="mb-marquee-viewport"]').getBoundingClientRect()
    // 两份内容组都要找：A 组标题飘出左边后，B 组副本正从右边进入
    const items = [...document.querySelectorAll('.message-marquee-item')]
      .filter(el => (el.querySelector('.message-marquee-text')?.textContent || '').includes(t))
    for (const el of items) {
      const r = el.getBoundingClientRect()
      const cx = r.x + r.width / 2
      // 用中心点判定，保证点击坐标确实落在视口内的标题上
      if (cx > vp.left + 20 && cx < vp.right - 20) {
        return { x: cx, y: r.y + r.height / 2 }
      }
    }
    return null
  }, text)
  if (!p) throw new Error('未找到视口内的标题：' + text)
  await page.mouse.move(p.x, p.y)
  await page.waitForTimeout(100) // 等 mouseover 委托把滚动置为暂停
  return p
}
async function hoverMovingText(page, text) { return pointerForText(page, text) }
async function clickMovingText(page, text) {
  const p = await pointerForText(page, text)
  await page.mouse.click(p.x, p.y)
  return p
}

/** 读每条弹幕轨道 rAF 写入的 translate3d x（数组顺序 = 轨道顺序，负值越来越小 = 由右向左） */
const READ_XS = () => [...document.querySelectorAll('[data-testid="mb-marquee-track"]')].map(el => {
  const m = (el.style.transform || '').match(/translate3d\((-?[\d.]+)px/)
  return m ? Number(m[1]) : 0
})

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)))

  await page.goto(base + '/workbench?section=messages', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="mb-panel"]', { timeout: 120000 })

  /* ---------- S1 空态 / 结构 ---------- */
  check('S1-1 无留言时不渲染空白滚动区',
    await page.locator('[data-testid="mb-marquee"]').count() === 0)
  await seed(page)
  await page.reload({ waitUntil: 'commit' })
  await page.waitForSelector('[data-testid="mb-marquee"]', { timeout: 120000 })
  await page.waitForTimeout(500) // 等 ResizeObserver 补足重复份数

  const struct = await page.evaluate(() => {
    const lanes = [...document.querySelectorAll('[data-testid^="mb-marquee-lane-"]')]
    const idsOf = (g) => [...g.querySelectorAll('[data-mb-id]')].map(b => b.getAttribute('data-mb-id'))
    const labelsOf = (g) => [...g.querySelectorAll('.message-marquee-text')].map(e => e.textContent.trim())
    const pairs = lanes.map(lane => {
      const groups = [...lane.querySelectorAll('[data-testid^="mb-marquee-group"]')]
      return { count: groups.length, same: JSON.stringify(idsOf(groups[0])) === JSON.stringify(idsOf(groups[1])) }
    })
    const firstGroups = lanes.map(l => l.querySelector('[data-testid="mb-marquee-group"]'))
    const marquee = document.querySelector('[data-testid="mb-marquee"]')
    const vp = document.querySelector('[data-testid="mb-marquee-viewport"]')
    const vr = vp.getBoundingClientRect()
    // 落在滚动视口水平范围内的所有标题（含循环副本）→ 校验任意时刻不出现重名
    const visibleLabels = [...document.querySelectorAll('.message-marquee-item')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vr.left && r.left < vr.right })
      .map(el => el.querySelector('.message-marquee-text').textContent.trim())
    const lab = document.querySelector('[data-testid="mb-marquee-label"]')
    const lr = lab.getBoundingClientRect(), mr = marquee.getBoundingClientRect()
    const lcs = getComputedStyle(lab)
    return {
      laneCount: lanes.length,
      paused: marquee.getAttribute('data-paused'),
      initialTransforms: [...document.querySelectorAll('[data-testid="mb-marquee-track"]')].map(t => t.style.transform || 'EMPTY'),
      pairs,
      allIds: firstGroups.flatMap(g => idsOf(g)),
      allLabels: firstGroups.flatMap(g => labelsOf(g)),
      visibleLabels,
      groupWidth: firstGroups[0]?.getBoundingClientRect().width ?? 0,
      viewportWidth: vp.clientWidth,
      marqueeWidth: mr.width,
      marqueeHeight: mr.height,
      laneHeight: lanes[0]?.getBoundingClientRect().height ?? 0,
      label: {
        position: lcs.position, pointerEvents: lcs.pointerEvents, display: lcs.display,
        top: Math.round(lr.top - mr.top), left: Math.round(lr.left - mr.left)
      },
      cards: document.querySelectorAll('[data-testid^="mb-card-"]').length
    }
  })
  check('S1-2 每条轨道内两个内容组完全同构', struct.laneCount >= 3 &&
    struct.pairs.every(p => p.count === 2 && p.same), `lanes=${struct.laneCount}`)
  check('S1-3 标题分配覆盖全部留言（一条留言只属于一条轨道）',
    new Set(struct.allIds).size === 3 && struct.cards === 3,
    `ids=${new Set(struct.allIds).size} cards=${struct.cards}`)
  check('S1-3b 留言名称不重复：轨道内/轨道间/视口可见均无重名',
    struct.allLabels.length === 3 && new Set(struct.allLabels).size === 3 &&
    new Set(struct.visibleLabels).size === struct.visibleLabels.length,
    `labels=${JSON.stringify(struct.allLabels)} visible=${JSON.stringify(struct.visibleLabels)}`)
  check('S1-3c 「留言速览」浮在卡片左上角且不占弹幕宽度',
    struct.label.position === 'absolute' && struct.label.top <= 0 && struct.label.left <= 24 &&
    struct.label.pointerEvents === 'none' && struct.label.display !== 'none' &&
    struct.viewportWidth / struct.marqueeWidth > 0.85,
    JSON.stringify(struct.label) + ` viewport=${struct.viewportWidth}/${Math.round(struct.marqueeWidth)}`)
  check('S1-4 弹幕区高度增加约 200px（原约 54px）且轨道均分',
    struct.marqueeHeight >= 240 && struct.laneHeight >= 36,
    `height=${Math.round(struct.marqueeHeight)} lane=${Math.round(struct.laneHeight)}`)
  // 等轨道真正开始位移再采样，避免 ResizeObserver 收敛窗口造成的偶发 0 值
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="mb-marquee-track"]')]
    .some(t => (t.style.transform || '').includes('translate3d')), null, { timeout: 10000 }).catch(() => {})
  const phases = await page.evaluate(READ_XS)
  check('S1-5 各轨道相位错开（弹幕错落，非整齐复制）',
    phases.length === struct.laneCount && new Set(phases.map(x => x.toFixed(1))).size > 1,
    JSON.stringify(phases.map(x => Number(x.toFixed(1)))) +
    ` paused=${struct.paused} init=${JSON.stringify(struct.initialTransforms)}`)

  /* ---------- S2 无缝覆盖 ---------- */
  check('S2-1 单组宽度 >= 视口宽度（回绕不露空白）',
    struct.groupWidth >= struct.viewportWidth && struct.viewportWidth > 0,
    `group=${Math.round(struct.groupWidth)} viewport=${struct.viewportWidth}`)

  /* ---------- S3 匀速右→左（所有轨道） ---------- */
  const before = await page.evaluate(READ_XS)
  await page.waitForTimeout(600)
  const after = await page.evaluate(READ_XS)
  const deltas = before.map((x, i) => x - (after[i] ?? x)) // 正值 = 向左
  check('S3-1 所有轨道由右向左、同速匀速左移', deltas.length === struct.laneCount &&
    deltas.every(d => d > 8 && d < 32) && Math.max(...deltas) - Math.min(...deltas) < 2,
    JSON.stringify(deltas.map(d => Number(d.toFixed(1)))))

  /* ---------- S4 hover 暂停 / 移出恢复 ---------- */
  // 不假设排序与轨道：按标题文本在视口内找当前可见的那一项
  await hoverMovingText(page, '周末提醒')
  const hold1 = await page.evaluate(READ_XS)
  await page.waitForTimeout(400)
  const hold2 = await page.evaluate(READ_XS)
  const pausedAttr = await page.locator('[data-testid="mb-marquee"]').getAttribute('data-paused')
  check('S4-1 鼠标移入任一标题项 → 全部轨道一起暂停',
    hold1.length === struct.laneCount && hold1.every((x, i) => Math.abs((hold2[i] ?? x) - x) < 0.01) &&
    pausedAttr === 'true', `lanes=${hold1.length} paused=${pausedAttr}`)

  await page.mouse.move(1400, 760)
  await page.waitForTimeout(140)
  const r1 = (await page.evaluate(READ_XS))[0]
  await page.waitForTimeout(500)
  const r2 = (await page.evaluate(READ_XS))[0]
  const resumeAttr = await page.locator('[data-testid="mb-marquee"]').getAttribute('data-paused')
  check('S4-2 移出后从当前位置恢复（不重置、不跳动）',
    r2 < r1 && Math.abs(r1 - hold2[0]) < 8 && resumeAttr === 'false',
    `resumeΔ=${(r1 - r2).toFixed(1)}px 跳变=${Math.abs(r1 - hold2[0]).toFixed(2)}px paused=${resumeAttr}`)

  /* ---------- S5 详情弹框 ---------- */
  await clickMovingText(page, '周末提醒')
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { timeout: 10000 })
  const detail = await page.evaluate(() => ({
    title: document.querySelector('[data-testid="mb-detail-title"]')?.textContent?.trim(),
    content: document.querySelector('[data-testid="mb-detail-content"]')?.textContent?.trim(),
    color: document.querySelector('[data-testid="mb-detail-color"]')?.textContent?.trim(),
    pinned: document.querySelector('[data-testid="mb-detail-pinned"]')?.textContent?.trim(),
    created: document.querySelector('[data-testid="mb-detail-created"]')?.textContent?.trim(),
    updated: document.querySelector('[data-testid="mb-detail-updated"]')?.textContent?.trim(),
    id: document.querySelector('[data-testid="mb-detail-id"]')?.textContent?.trim()
  }))
  check('S5-1 弹框展示完整正文（多行保留）与全部现有字段',
    !!detail.title && (detail.content || '').includes('这是第二行完整正文') &&
    !!detail.color && !!detail.pinned && !!detail.created && !!detail.updated && (detail.id || '').startsWith('mb_'),
    JSON.stringify(detail))
  check('S5-2 弹框打开期间滚动暂停', await page.locator('[data-testid="mb-marquee"]').getAttribute('data-paused') === 'true')

  await page.locator('[data-testid="mb-detail-close"]').click()
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { state: 'detached', timeout: 10000 })
  await page.mouse.move(1400, 760) // 关闭后把指针移开，避免重新命中标题导致再次暂停
  await page.waitForTimeout(120)
  const c1 = (await page.evaluate(READ_XS))[0]
  await page.waitForTimeout(450)
  const c2 = (await page.evaluate(READ_XS))[0]
  check('S5-3 关闭后滚动恢复且不影响后续交互', c2 < c1 &&
    await page.locator('[data-testid="mb-marquee"]').getAttribute('data-paused') === 'false',
    `Δ=${(c1 - c2).toFixed(1)}px`)

  // 再点另一条标题 → 仍能打开，且内容对应
  await clickMovingText(page, '非常非常')
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { timeout: 10000 })
  const secondTitle = await page.locator('[data-testid="mb-detail-title"]').innerText()
  check('S5-4 关闭后可再次点击其它标题打开详情', secondTitle.includes('非常非常'), secondTitle.slice(0, 30))
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { state: 'detached', timeout: 10000 }).catch(() => {})

  /* ---------- S6 长标题省略 ---------- */
  const ellipsis = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.message-marquee-text')]
    const long = spans.find(s => s.textContent.includes('非常非常'))
    if (!long) return null
    const cs = getComputedStyle(long)
    return { overflow: long.scrollWidth - long.clientWidth, textOverflow: cs.textOverflow, nowrap: cs.whiteSpace }
  })
  check('S6-1 过长标题省略显示（不撑破滚动区）',
    !!ellipsis && ellipsis.overflow > 0 && ellipsis.textOverflow === 'ellipsis' && ellipsis.nowrap === 'nowrap',
    JSON.stringify(ellipsis))

  /* ---------- S7 卡片列表保持原样 ---------- */
  const unchanged = await page.evaluate(() => {
    const card = document.querySelector('.message-card')
    return {
      grid: !!document.querySelector('[data-testid="mb-grid"]'),
      cols: getComputedStyle(document.querySelector('[data-testid="mb-grid"]')).gridTemplateColumns.split(' ').length,
      cards: document.querySelectorAll('[data-testid^="mb-card-"]').length,
      // 卡片上的三个内联按钮已移除，整卡改为可聚焦的点击入口
      noInlineActions: !card?.querySelector('[data-testid^="mb-edit-"], [data-testid^="mb-pin-"], [data-testid^="mb-delete-"]'),
      clickable: card?.getAttribute('role') === 'button' && card?.getAttribute('tabindex') === '0',
      toolbar: !!document.querySelector('[data-testid="mb-toolbar"]'),
      add: !!document.querySelector('[data-testid="mb-add-button"]')
    }
  })
  check('S7-1 卡片网格 / 三张卡 / 整卡可点击（无内联按钮）/ 工具条保持可用',
    unchanged.grid && unchanged.cols >= 2 && unchanged.cards === 3 &&
    unchanged.noInlineActions && unchanged.clickable && unchanged.toolbar && unchanged.add,
    JSON.stringify(unchanged))
  await page.locator('[data-testid^="mb-card-"]').first().click()
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { timeout: 10000 })
  check('S7-1b 点击卡片打开详情，操作按钮收在弹框内',
    (await page.locator('[data-testid="mb-detail-content"]').innerText()).length > 0 &&
    await page.locator('[data-testid="mb-detail-dialog"] [data-testid^="mb-edit-"]').count() === 1)
  await page.locator('[data-testid="mb-detail-close"]').click()
  await page.locator('[data-testid="mb-search-input"]').fill('长标题')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="mb-card-"]').length === 1, null, { timeout: 10000 })
  check('S7-2 原有搜索筛选交互不受影响', await page.locator('[data-testid^="mb-card-"]').count() === 1 &&
    await page.locator('[data-testid="mb-marquee"]').count() === 1)
  await page.locator('[data-testid="mb-search-input"]').fill('')

  /* ---------- S8 暗色 / 移动端 ---------- */
  const dark = await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    const bg = getComputedStyle(document.querySelector('.message-marquee')).backgroundColor
    document.documentElement.classList.remove('dark')
    const m = bg.match(/rgba?\((\d+), (\d+), (\d+)/)
    return { bg, sum: m ? Number(m[1]) + Number(m[2]) + Number(m[3]) : 999 }
  })
  check('S8-1 暗色下滚动区沿用深色卡面', dark.sum < 420, JSON.stringify(dark))

  const mobCtx = await browser.newContext({ viewport: { width: 375, height: 760 }, storageState: { cookies: [], origins: [] } })
  const mob = await mobCtx.newPage()
  mob.on('pageerror', e => errs.push('[mobile] ' + String(e.message).slice(0, 140)))
  await mob.goto(base + '/workbench?section=messages', { waitUntil: 'commit', timeout: 120000 })
  await mob.waitForSelector('[data-testid="mb-panel"]', { timeout: 120000 })
  await seed(mob)
  await mob.reload({ waitUntil: 'commit' })
  await mob.waitForSelector('[data-testid="mb-marquee"]', { timeout: 120000 })
  const mobState = await mob.evaluate(() => {
    const lcs = getComputedStyle(document.querySelector('.message-marquee-label'))
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      labelFloating: lcs.position === 'absolute' && lcs.display !== 'none',
      gridCols: getComputedStyle(document.querySelector('[data-testid="mb-grid"]')).gridTemplateColumns.split(' ').length,
      cards: document.querySelectorAll('[data-testid^="mb-card-"]').length
    }
  })
  check('S8-2 375px 无横向溢出、卡片仍单列、浮动标签保持可见',
    mobState.overflow <= 1 && mobState.gridCols === 1 && mobState.labelFloating && mobState.cards === 3,
    JSON.stringify(mobState))
  await mobCtx.close()

  check('S8-3 全过程无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))
  await ctx.close()

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server) server.kill()
}
