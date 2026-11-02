// 2026-11 按钮统一 QA：探针关键页面按钮的 computed height/font-size
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:16798';
const OUT = 'qa-btn-unify';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);

const results = [];
async function probe(label, selector) {
  try {
    const r = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { h: rect.height, w: rect.width, fs: cs.fontSize, pad: cs.padding, radius: cs.borderRadius, bg: cs.backgroundColor };
    }, selector);
    results.push({ label, selector, ...r });
    console.log(`${label} [${selector}]:`, JSON.stringify(r));
  } catch (e) {
    results.push({ label, selector, error: String(e).slice(0, 120) });
    console.log(`${label} [${selector}]: ERROR`, String(e).slice(0, 120));
  }
}

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// 1) 首页（导航站）
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1200);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(400);
await probe('首页 el-button(默认档)', '.el-button:not(.el-button--small):not(.el-button--large)');
await probe('首页 ui-btn 别名', '.ui-btn');
await shot('01-home');

// 2) 个人工作台（日记参考页）
await page.goto(BASE + '/workbench', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(600);
const diaryBtn = await page.$('[data-testid="dj-save-btn"]');
if (diaryBtn) { await diaryBtn.scrollIntoViewIfNeeded(); }
await probe('日记保存按钮 dj-save-btn', '[data-testid="dj-save-btn"]');
await probe('工作台 ui-btn(.btn-add)', '.btn-add');
await shot('02-workbench');

// 3) 教师工作台（tw-btn 胶囊）
await page.goto(BASE + '/teacher', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(600);
await probe('教师 tw-btn', '.tw-btn');
await shot('03-teacher');

// 4) 工具箱（tu-btn / tu-seg）
await page.goto(BASE + '/toolbox', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(600);
await shot('04-toolbox');

// 5) 弹框底部按钮：打开站点设置里的某弹框（用 AppSettingsDialog 底部）
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1200);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(400);
// 尝试打开一个 BaseDialog 弹框：点导航站「添加站点」
const addBtn = await page.$('.nav-add-site');
if (addBtn) { await addBtn.click(); await page.waitForTimeout(800); }
await probe('弹框底部 bd-footer 按钮', '.bd-footer .el-button');
await probe('弹框关闭钮 close-btn', '.close-btn');
await shot('05-dialog-footer');

await browser.close();
fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(results, null, 2));
console.log('DONE');
