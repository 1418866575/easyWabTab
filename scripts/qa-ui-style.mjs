// 界面美化（UiStyle）QA：默认零变化 → 调项生效 → 恢复默认归位。
// 用法：先起 dev（node node_modules/vite/bin/vite.js --port 16798），再 node scripts/qa-ui-style.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.QA_BASE || 'http://localhost:16798';
const OUT = 'qa-ui-style';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);

/** 关闭首访自动弹出的帮助框（它会拦截后续点击） */
async function closeHelp() {
  const overlay = page.locator('.help-dialog');
  if ((await overlay.count()) === 0) return;
  const btn = overlay.locator('.close-btn').first();
  if (await btn.count()) await btn.click().catch(() => {});
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

async function openUiStylePage() {
  await closeHelp();
  await page.locator('.btn-help').first().click({ force: true });
  await page.waitForTimeout(1200);
  await page.waitForSelector('.rail-item', { state: 'attached', timeout: 15000 });
  await page.locator('.rail-item', { hasText: '界面美化' }).first().click({ force: true });
  await page.waitForSelector('[data-testid="ui-style-panel"]', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(300);
}

await closeHelp();

/** 读取关键计算样式 */
const probe = () =>
  page.evaluate(() => {
    const root = document.documentElement;
    const px = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).height : null;
    };
    const fs = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fontSize : null;
    };
    return {
      hasAttr: root.hasAttribute('data-ui-style'),
      contentPad: getComputedStyle(root).getPropertyValue('--ui-content-pad').trim(),
      ctrlH: getComputedStyle(root).getPropertyValue('--ui-ctrl-h').trim(),
      fsScale: getComputedStyle(root).getPropertyValue('--ui-fs-scale').trim(),
      inlineCtrlH: root.style.getPropertyValue('--ui-ctrl-h'),
      btnH: px('.ui-btn'),
      inputH: px('.ui-input'),
      segH: px('.seg-control'),
      labelFs: fs('.hub-label')
    };
  });

// —— 打开设置 → 界面美化 ——
await openUiStylePage();

const segCount = await page.locator('.hub .seg-opt').count();
check('面板渲染出全部调节项（10 项 / 34 个选项）', segCount === 34, `seg-opt=${segCount}`);

const d0 = await probe();
check('默认：不挂 data-ui-style（派生层不参与计算）', d0.hasAttr === false);
check('默认：控件高 36px（按钮/输入/分段一致）', d0.btnH === '36px' && d0.inputH === '36px' && d0.segH === '36px', JSON.stringify([d0.btnH, d0.inputH, d0.segH]));
check('默认：无内联覆盖变量', d0.inlineCtrlH === '', `inline=${d0.inlineCtrlH || '(空)'}`);
check('默认：内容区边距 16px', d0.contentPad === '16px', d0.contentPad);
check('默认：辅助标签 13px', d0.labelFs === '13px', d0.labelFs);
await page.screenshot({ path: `${OUT}/01-default.png` });

// —— 预设配方：一键换方向，再一键回标准 ——
await page.click('[data-testid="ui-style-preset-comfortable"]');
await page.waitForTimeout(250);
const dPreset = await probe();
check(
  '预设「大字护眼」：控件 40px / 字号 14.3px',
  dPreset.btnH === '40px' && dPreset.labelFs === '14.3px',
  `${dPreset.btnH} / ${dPreset.labelFs}`
);
await page.click('[data-testid="ui-style-preset-standard"]');
await page.waitForTimeout(250);
const dBack = await probe();
check('预设「标准」：回到默认（36px / 无内联变量）', dBack.btnH === '36px' && dBack.inlineCtrlH === '', `${dBack.btnH} / ${dBack.inlineCtrlH || '(空)'}`);

// —— 调控件高度 44 ——
await page.click('[data-testid="ui-style-ctrlH-44px"]');
await page.waitForTimeout(250);
const d1 = await probe();
check('控件高 44：按钮跟随', d1.btnH === '44px', d1.btnH);
check('控件高 44：输入框跟随', d1.inputH === '44px', d1.inputH);
check('控件高 44：分段控件跟随', d1.segH === '44px', d1.segH);
check('调过之后才挂 data-ui-style', d1.hasAttr === true);

// —— 字号 110% + 内容边距 24 ——
await page.click('[data-testid="ui-style-fsScale-1.1"]');
await page.click('[data-testid="ui-style-contentPad-24px"]');
await page.waitForTimeout(250);
const d2 = await probe();
check('字号 110%：标签 13 → 14.3px', d2.labelFs === '14.3px', d2.labelFs);
check('内容边距 24：变量已写内联', d2.contentPad === '24px', d2.contentPad);
check('已调整项数应为 3', (await page.locator('.hub-preview-badge').innerText()).includes('3'), await page.locator('.hub-preview-badge').innerText());
await page.screenshot({ path: `${OUT}/02-custom.png` });

// —— 跨页生效：工作台内容区边距（验证消费者真的接了变量） ——
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.goto(BASE + '/workbench', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const wbPad = await page.evaluate(() => {
  const el = document.querySelector('.wb-content');
  return el ? getComputedStyle(el).padding : null;
});
check('工作台内容区边距跟随 24px', wbPad === '24px', String(wbPad));
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

// —— 刷新后保持 ——
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const d3 = await page.evaluate(() => ({
  ctrlH: getComputedStyle(document.documentElement).getPropertyValue('--ui-ctrl-h').trim(),
  fsScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-fs-scale').trim()
}));
check('刷新后配置保持（本机持久化）', d3.ctrlH === '44px' && d3.fsScale === '1.1', JSON.stringify(d3));

// —— 恢复默认 ——
await openUiStylePage();

// 间距缩放：先确认默认 16px，再切 0.85 档，看间距是否真的动了
const gap0 = await page.evaluate(() => getComputedStyle(document.querySelector('.hub')).rowGap);
await page.click('[data-testid="ui-style-spaceScale-0.85"]');
await page.waitForTimeout(250);
const gap1 = await page.evaluate(() => getComputedStyle(document.querySelector('.hub')).rowGap);
check('间距缩放生效：16 → 13.6px', gap0 === '16px' && gap1 === '13.6px', `${gap0} → ${gap1}`);

await page.click('[data-testid="ui-style-reset"]');
await page.waitForTimeout(250);
const d4 = await probe();
check('恢复默认：控件高回 36px', d4.btnH === '36px' && d4.inputH === '36px', JSON.stringify([d4.btnH, d4.inputH]));
check('恢复默认：内联变量清空', d4.inlineCtrlH === '', `inline=${d4.inlineCtrlH || '(空)'}`);
check('恢复默认：字号回 13px', d4.labelFs === '13px', d4.labelFs);
await page.screenshot({ path: `${OUT}/03-reset.png` });

// —— 暗色抽检 ——
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.waitForTimeout(300);
await openUiStylePage();
await page.screenshot({ path: `${OUT}/04-dark.png` });

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} / ${results.length} 通过`);
if (failed.length) {
  console.log('失败项：', failed.map((f) => f.name).join(' / '));
  process.exit(1);
}
console.log('DONE');
