/**
 * 存款利息计算器（/toolbox → deposit-calc）浏览器目视验证
 *
 * 复用本机已装 chromium；桌面 + 移动视口各跑一遍。
 * 重点验证：卡片入口 / 表单可输入 / 结论卡数值 / 阶梯表与时间轴 / 300 万时银行分散提示。
 *
 * 用法：node scripts/qa-deposit-ui.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const BASE = process.argv[2] || 'http://127.0.0.1:16741'
const OUT = path.join(process.cwd(), 'qa-deposit')
fs.mkdirSync(OUT, { recursive: true })

function findChromium() {
  // 1) playwright 自带缓存（若已安装）
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (fs.existsSync(root)) {
    const dirs = fs
      .readdirSync(root)
      .filter(d => d.startsWith('chromium-'))
      .sort()
      .reverse()
    for (const d of dirs) {
      const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
      if (fs.existsSync(p)) return p
    }
  }
  // 2) 回落到本机 Edge / Chrome（未装 playwright 浏览器时）
  const fallbacks = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ]
  return fallbacks.find(p => fs.existsSync(p))
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: findChromium() })

async function run(label, viewport) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/toolbox`, { waitUntil: 'domcontentloaded' })

  const card = page.locator('[data-testid=tb-card-deposit-calc]')
  await card.waitFor({ state: 'visible', timeout: 15000 })
  check(`[${label}] 工具卡片存在`, true)
  await card.click()

  const modal = page.locator('[data-testid=tb-modal-output]').first()
  await modal.waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(600)

  const body = await page.locator('.tb-panel, .tu-t4').first().innerText().catch(() => '')
  check(`[${label}] 渲染结论速览`, body.includes('收益最高策略'), body.slice(0, 40).replace(/\n/g, ' '))
  check(`[${label}] 有五档依据说明`, (await page.locator('.tu-folding').count()) >= 1)

  // 默认 100 万 / 0.95% / 30% 流动 → 阶梯 30+35+35
  const ladderText = await page.locator('.tu-t4').first().innerText()
  check(`[${label}] 阶梯含 3 年档`, ladderText.includes('3 年档'))
  check(`[${label}] 含流动性成本`, ladderText.includes('流动性成本'))
  check(`[${label}] 含折合年化`, ladderText.includes('折合年化'))

  // 改本金为 300 万 → 应出现 6 家银行提示
  const principalInput = page.locator('.tu-t4 input[type=number]').first()
  await principalInput.fill('3000000')
  await page.waitForTimeout(500)
  const after = await page.locator('.tu-t4').first().innerText()
  check(`[${label}] 300 万触发分银行提示`, after.includes('6 家银行'), after.match(/\d+ 家银行/)?.[0] || '无')

  await page.screenshot({ path: path.join(OUT, `${label}-full.png`), fullPage: false })
  const dialog = page.locator('.tb-modal, .tu-t4').first()
  await dialog.screenshot({ path: path.join(OUT, `${label}-tool.png`) }).catch(() => {})

  // 横向溢出检查：内容区不应出现横向滚动
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.tu-t4')
    if (!el) return null
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
  })
  check(`[${label}] 无横向溢出`, !overflow || overflow.scrollWidth <= overflow.clientWidth + 2, JSON.stringify(overflow))

  await ctx.close()
}

await run('desktop', { width: 1440, height: 900 })
await run('mobile', { width: 390, height: 844 })

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length) process.exitCode = 1
