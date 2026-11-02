// 导航站优化 QA 第二轮：展开分类条 + 本站搜索下拉
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:16798';
const OUT = 'qa-nav-opt';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(400);

// 1) 展开「分类·标签」
const toggle = await page.$('.cat-filter-toggle, [class*="filter-toggle"], .toolbar-toggle');
let clicked = false;
for (const sel of ['.cat-filter-toggle', '[data-testid*="filter"]', 'text=分类 · 标签', 'text=分类·标签']) {
  const el = await page.$(sel);
  if (el) { await el.click(); clicked = true; break; }
}
console.log('toggle clicked:', clicked);
await page.waitForTimeout(600);

// 2) 探分类标签字号（CategoryTabs 渲染后）
const catProbe = await page.evaluate(() => {
  const inner = document.querySelector('.category-tabs-wrapper .el-radio-button__inner')
    || document.querySelector('.ui-tabs .el-radio-button__inner');
  if (!inner) return null;
  const cs = getComputedStyle(inner);
  return { fs: cs.fontSize, fw: cs.fontWeight, h: inner.getBoundingClientRect().height, text: inner.textContent.trim().slice(0, 6) };
});
console.log('CAT-TAB:', JSON.stringify(catProbe));

// 3) 搜索下拉：切本站搜索并输入
const input = await page.$('.global-search-wrapper input');
if (input) {
  await input.click();
  await page.waitForTimeout(300);
  // 找引擎下拉切到本站
  const sel = await page.$('.global-search-wrapper select');
  if (sel) {
    const opts = await sel.$$eval('option', os => os.map(o => ({ v: o.value, t: o.textContent })));
    console.log('ENGINE OPTIONS:', JSON.stringify(opts));
    const local = opts.find(o => /本站|local/i.test(o.t + o.v));
    if (local) { await sel.selectOption(local.v); await page.waitForTimeout(300); }
  }
  await input.fill('工具');
  await page.waitForTimeout(600);
  const dd = await page.evaluate(() => {
    const visible = !!document.querySelector('.history-dropdown');
    const out = { visible };
    const t = document.querySelector('.history-text');
    if (t) { const cs = getComputedStyle(t); out.text = { fs: cs.fontSize, fw: cs.fontWeight, s: t.textContent.trim().slice(0, 8) }; }
    const ti = document.querySelector('.history-title');
    if (ti) { const cs = getComputedStyle(ti); out.title = { fs: cs.fontSize, fw: cs.fontWeight }; }
    const sc = document.querySelector('.site-category');
    if (sc) { const cs = getComputedStyle(sc); out.siteCat = { fs: cs.fontSize }; }
    return out;
  });
  console.log('DROPDOWN:', JSON.stringify(dd));
  await page.screenshot({ path: `${OUT}/02-dropdown-local.png` });
} else {
  console.log('input not found');
}
await page.screenshot({ path: `${OUT}/03-final.png` });
await browser.close();
console.log('DONE');
