#!/usr/bin/env node
/**
 * 视觉回归校验：真正点进每个工作台的子面板再测。
 *
 * 为什么需要它：路由只有 9 个顶层（/ /workbench /business /student /teacher /toolbox
 * /smart /blog /blog/admin），台账/生意/学生各模块都是组件内部状态切换。直接 goto
 * `/workbench/notes` 这类路径拿到的是空壳，测出来的「0 溢出」是假绿。
 *
 * 每屏检查四件事：
 *   1. 横向溢出（排掉自身可滚动的容器与页脚访问计数）
 *   2. 小于 12px 的正文（12px 是项目字号下限）
 *   3. 文字对比度（WCAG AA：正文 4.5、大字号 3）—— 只报告不阻断，见 --fail-contrast
 *   4. 控制台错误 / 未捕获异常
 *
 * 用法：
 *   npm run build && npx serve -s dist -l 16718
 *   node scripts/qa-visual.mjs                      # 默认 http://127.0.0.1:16718
 *   node scripts/qa-visual.mjs --url http://127.0.0.1:8080
 *   node scripts/qa-visual.mjs --dark --accent brown
 *   node scripts/qa-visual.mjs --only workbench,student
 *   node scripts/qa-visual.mjs --json > qa.json
 *
 * 退出码：控制台错误或横向溢出 > 0 → 1；--fail-contrast 时不达标数 > 0 → 1。
 */
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes('--' + name);

const BASE = arg('url', 'http://127.0.0.1:16718').replace(/\/$/, '');
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const DARK = flag('dark');
const ACCENT = arg('accent', '');
const JSON_OUT = flag('json');
const FAIL_CONTRAST = flag('fail-contrast');
const TIMEOUT = Number(arg('timeout', '25000'));

/** 视图清单：menus 是子面板菜单项选择器，空表示该视图没有子面板 */
const VIEWS = [
  { key: 'home', name: '导航首页', route: '/' },
  { key: 'workbench', name: '台账', route: '/workbench', menus: '.wb-menu-item' },
  { key: 'business', name: '销售记账', route: '/business', menus: '.bs-menu-item, .bs-nav-item, .el-tabs__item' },
  { key: 'student', name: '学生守护', route: '/student', menus: '.st-menu-item, .el-tabs__item' },
  { key: 'teacher', name: '教师工作台', route: '/teacher', menus: '.tc-menu-item, .tk-menu-item, .el-tabs__item' },
  { key: 'smart', name: '智能工作台', route: '/smart', menus: '.sv-nav-item, .el-tabs__item' },
  { key: 'toolbox', name: '工具箱', route: '/toolbox' },
  { key: 'books', name: '图书馆', route: '/books' },
  { key: 'blog', name: '博客前台', route: '/blog' },
  { key: 'blog-admin', name: '博客后台', route: '/blog/admin' },
];

/** 在页面上下文里跑：溢出 / 小字 / 对比度 */
const PROBE = () => {
  const rgb = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (t, b) => ({
    r: t.r * t.a + b.r * (1 - t.a),
    g: t.g * t.a + b.g * (1 - t.a),
    b: t.b * t.a + b.b * (1 - t.a),
    a: 1,
  });
  const bgOf = (el) => {
    const stack = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a === 1) break;
      }
      n = n.parentElement;
    }
    let base = rgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
    return base;
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const cls = (el) =>
    (typeof el.className === 'string' && el.className ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()).slice(0, 40);

  // 1) 横向溢出
  const overflow = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.scrollWidth - el.clientWidth <= 4 || el.clientWidth <= 0) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    // 省略号截断是设计意图，不算溢出
    if (cs.textOverflow === 'ellipsis') continue;
    // 隐藏控件（1px 的 file input、零透明装饰层）不算
    if (cs.opacity === '0' || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 4 || rect.height <= 4) continue;
    const c = cls(el);
    if (/visitor-counter|beian/.test(c)) continue;
    overflow.push(c);
  }

  // 2) 小字 + 3) 对比度（只看真正承载文本的元素）
  const tiny = [];
  const lowContrast = [];
  let textNodes = 0;
  for (const el of document.querySelectorAll('body *')) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('');
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    // aria-hidden 的装饰性字形（工具箱卡片上的 emoji 图标等）不是文字，不参与字号与对比度判定；
    // 它们属「非文本内容」，WCAG 只要求 3:1 且仅针对有语义的图形。不过滤的话工具箱一次报 157 条噪声。
    if (el.closest('[aria-hidden="true"]') || el.getAttribute('aria-hidden') === 'true') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    textNodes++;
    const fs = parseFloat(cs.fontSize);
    if (fs > 0 && fs < 12) tiny.push(`${fs}px ${cls(el)} 「${own.slice(0, 14)}」`);
    const fg = rgb(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const solid = fg.a < 1 ? blend(fg, bg) : fg;
    const v = ratio(solid, bg);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = fs >= 18.66 || (bold && fs >= 14) ? 3 : 4.5;
    if (v < need) lowContrast.push({ cr: +v.toFixed(2), fs: +fs.toFixed(1), cls: cls(el), txt: own.slice(0, 16) });
  }
  lowContrast.sort((a, b) => a.cr - b.cr);
  return { overflow, tiny, lowContrast, textNodes };
};

const uniq = (arr) => [...new Set(arr)];

async function measure(page, label) {
  const r = await page.evaluate(PROBE);
  return {
    label,
    textNodes: r.textNodes,
    overflow: uniq(r.overflow),
    tiny: uniq(r.tiny),
    lowContrast: r.lowContrast,
  };
}

async function applyTheme(page) {
  if (!DARK && !ACCENT) return;
  await page.evaluate(([dark, accent]) => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
    if (accent) root.setAttribute('data-accent', accent);
  }, [DARK, ACCENT]);
  await page.waitForTimeout(400);
}

const results = [];
let errors = [];

const views = ONLY.length ? VIEWS.filter((v) => ONLY.includes(v.key)) : VIEWS;
const browser = await chromium.launch({ channel: process.env.QA_BROWSER || 'msedge', args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: Number(arg('width', '1440')), height: Number(arg('height', '900')) } });

for (const view of views) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`${view.route} :: ${m.text().slice(0, 90)}`);
  });
  page.on('pageerror', (e) => errs.push(`${view.route} :: PAGEERROR ${e.message.slice(0, 90)}`));

  try {
    await page.goto(BASE + view.route, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  } catch (e) {
    results.push({ view: view.name, route: view.route, label: '打开失败', error: e.message.slice(0, 80) });
    errors = errors.concat(errs);
    await page.close();
    continue;
  }
  await page.waitForTimeout(1600);
  await applyTheme(page);

  const panels = [await measure(page, '整页')];

  if (view.menus) {
    let count = 0;
    const first = await page.$$(view.menus);
    count = first.length;
    for (let i = 0; i < count; i++) {
      const items = await page.$$(view.menus);
      if (!items[i]) continue;
      let label = '';
      try {
        label = (await items[i].innerText()).replace(/\s+/g, ' ').trim().slice(0, 12) || `#${i}`;
        await items[i].click({ timeout: 3000 });
      } catch (e) {
        continue;
      }
      await page.waitForTimeout(700);
      panels.push(await measure(page, label));
    }
  }

  results.push({ view: view.name, route: view.route, panels, empty: panels.length === 1 && panels[0].textNodes < 25 });
  errors = errors.concat(errs);
  await page.close();
}

await browser.close();

// ---------- 输出 ----------
if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE, dark: DARK, accent: ACCENT || null, results, errors }, null, 1));
} else {
  console.log(`\n视觉校验 · ${BASE}${DARK ? ' · 暗色' : ' · 亮色'}${ACCENT ? ' · ' + ACCENT : ''}\n`);
  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    if (r.error) {
      console.log(`✗ ${pad(r.view, 10)} ${pad(r.route, 16)} ${r.error}`);
      continue;
    }
    const panels = r.panels;
    const of = panels.reduce((s, p) => s + p.overflow.length, 0);
    const tiny = panels.reduce((s, p) => s + p.tiny.length, 0);
    const lc = panels.reduce((s, p) => s + p.lowContrast.length, 0);
    const nodes = panels.reduce((s, p) => s + p.textNodes, 0);
    const mark = of || tiny ? '✗' : '✓';
    const note = r.empty ? '  (空状态，未建数据)' : '';
    console.log(
      `${mark} ${pad(r.view, 10)} ${pad(r.route, 16)} 面板 ${String(panels.length).padStart(2)}  文本 ${String(nodes).padStart(3)}  溢出 ${of}  小于12px ${tiny}  对比度不达标 ${lc}${note}`
    );
    for (const p of panels) {
      if (p.overflow.length) console.log(`     ↳ [${p.label}] 溢出: ${p.overflow.slice(0, 4).join(', ')}`);
      if (p.tiny.length) console.log(`     ↳ [${p.label}] 小字: ${p.tiny.slice(0, 4).join(', ')}`);
      if (p.lowContrast.length && flag('verbose')) {
        console.log(`     ↳ [${p.label}] 低对比: ${p.lowContrast.slice(0, 4).map((x) => `${x.cr}(${x.fs}px ${x.cls})`).join(', ')}`);
      }
    }
  }
  const lcTotal = results.reduce((s, r) => s + (r.panels || []).reduce((a, p) => a + p.lowContrast.length, 0), 0);
  console.log(`\n控制台错误: ${errors.length}`);
  errors.slice(0, 8).forEach((e) => console.log('  ' + e));
  console.log(`对比度不达标合计: ${lcTotal}（加 --verbose 看明细；用 --fail-contrast 让它阻断）\n`);
}

const hardFail =
  errors.length > 0 ||
  results.some((r) => r.error) ||
  results.some((r) => (r.panels || []).some((p) => p.overflow.length || p.tiny.length));
const contrastFail =
  FAIL_CONTRAST && results.some((r) => (r.panels || []).some((p) => p.lowContrast.length));
process.exit(hardFail || contrastFail ? 1 : 0);
