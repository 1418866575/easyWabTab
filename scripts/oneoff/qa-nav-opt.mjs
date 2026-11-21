// 导航站优化 QA：搜索下拉文字 + 分类字号
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
await page.waitForTimeout(500);

// 探针：分类标签字号
const probe = await page.evaluate(() => {
  const r = {};
  const inner = document.querySelector('.category-tabs-wrapper .el-radio-button__inner');
  if (inner) { const cs = getComputedStyle(inner); r.catTab = { fs: cs.fontSize, fw: cs.fontWeight, h: inner.getBoundingClientRect().height }; }
  const mi = document.querySelector('.nav-menu-label');
  r.hasSidebar = !!mi;
  return r;
});
console.log('PROBE:', JSON.stringify(probe));

// 点搜索框打开下拉（全部历史）
const input = await page.$('.global-search-wrapper input, .global-search-wrapper .search-input, .search-section input');
if (input) {
  await input.click();
  await page.waitForTimeout(800);
  const dd = await page.evaluate(() => {
    const t = document.querySelector('.history-text');
    const ti = document.querySelector('.history-title');
    const visible = !!document.querySelector('.history-dropdown');
    const out = { visible };
    if (t) { const cs = getComputedStyle(t); out.historyText = { fs: cs.fontSize, fw: cs.fontWeight, text: t.textContent.slice(0, 12) }; }
    if (ti) { const cs = getComputedStyle(ti); out.historyTitle = { fs: cs.fontSize, fw: cs.fontWeight }; }
    return out;
  });
  console.log('DROPDOWN:', JSON.stringify(dd));
  // 截下拉区域：整页截图即可
  await page.screenshot({ path: `${OUT}/01-dropdown.png` });
} else {
  console.log('search input NOT FOUND');
  await page.screenshot({ path: `${OUT}/01-home.png` });
}

await browser.close();
console.log('DONE');
