#!/usr/bin/env node
/**
 * 8 套 accent × 明暗 主题令牌守卫。
 *
 * 为什么需要它：主题是纯 CSS 变量层叠，构建通过、甚至页面能打开都证明不了
 * 「7 套都生效」。历史事故：--color-primary-light 在暗色下是近白补丁、
 * 6/7 主题主按钮白字 <4.5、暗色面板硬编码蓝块、首屏闪蓝 —— 全部只能靠
 * 读计算样式发现。
 *
 * 用法：
 *   npm run build && npx serve -s dist -l 16718
 *   npm run qa:theme                        # 默认 http://127.0.0.1:16718
 *   node scripts/probe-theme-tokens.mjs --url http://127.0.0.1:16730
 *
 * 退出码：任一断言失败 → 1。
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const BASE = arg('url', 'http://127.0.0.1:16718').replace(/\/$/, '');
const ACCENTS = ['blue', 'brown', 'pink', 'green', 'purple', 'red', 'gray', 'graphite'];

/* ---------- 静态：首屏映射与 THEMES 必须一致 ---------- */
function checkMapping() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ts = readFileSync(new URL('../src/stores/theme.ts', import.meta.url), 'utf8');
  const block = /var MAP = \{([\s\S]*?)\};/.exec(html);
  if (!block) return ['index.html 里找不到 MAP 映射'];
  const map = {};
  for (const m of block[1].matchAll(/'?([\w-]+)'?\s*:\s*\[\s*'(\w+)'\s*,\s*(0|1|null)\s*\]/g)) {
    map[m[1]] = [m[2], m[3] === 'null' ? null : m[3] === '1'];
  }
  const errs = [];
  for (const m of ts.matchAll(/\{\s*id:\s*'([\w-]+)',\s*name:\s*'[^']+',\s*mode:\s*'(light|dark)',\s*accent:\s*'([\w-]+|null)'/g)) {
    const [, id, mode, accent] = m;
    if (id === 'system') continue;
    const e = map[id];
    if (!e) { errs.push(`index.html 缺 ${id} 的首屏映射`); continue; }
    const wantAccent = accent === 'null' ? 'blue' : accent;
    if (e[0] !== wantAccent || e[1] !== (mode === 'dark')) {
      errs.push(`${id} 首屏映射 ${e.join('/')} ≠ THEMES ${wantAccent}/${mode === 'dark'}`);
    }
  }
  return errs;
}

/* ---------- 浏览器：计算样式 + 对比度 ---------- */
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);

const cells = await page.evaluate((accents) => {
  const root = document.documentElement;
  const keys = [
    '--color-primary', '--color-primary-solid', '--color-primary-solid-hover',
    '--color-primary-text', '--color-primary-light', '--color-primary-soft',
    '--color-primary-50', '--color-primary-400', '--color-primary-ring',
    '--color-bg-card', '--ink-1', '--ink-2', '--ink-3', '--ink-4',
    '--el-color-primary', '--el-color-info', '--color-on-accent',
  ];
  const parse = (v) => {
    v = (v || '').trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(v);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      if (h.length === 6) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
      if (h.length === 8) return [0, 2, 4, 6].map((i, k) => k === 3 ? parseInt(h.slice(6, 8), 16) / 255 : parseInt(h.slice(i, i + 2), 16));
      return null;
    }
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(v);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    // color-mix 作为 background 的计算值会序列化成 color(srgb r g b / a)，通道是 0-1 浮点
    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(v);
    if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    return null;
  };
  const over = (fg, bg) => fg && [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = (c) => {
    if (!c) return null;
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const cr = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (l1 === null || l2 === null) ? null : +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
  };
  const read = () => {
    const cs = getComputedStyle(root);
    const o = {};
    for (const k of keys) o[k] = cs.getPropertyValue(k).trim();
    return o;
  };
  // 探针 1：验证「在按钮元素上重定义 --color-primary」确实让 scoped 背景继承到 solid
  const probe = document.createElement('button');
  probe.className = 'ui-btn--primary';
  probe.style.display = 'none';
  document.body.appendChild(probe);
  // 探针 2/3：color-mix() 作为自定义属性的值不会展开，只有落到 background 上
  // 才会序列化成 color(srgb ...)，故用真实元素读计算色再合成到卡面。
  const mkProbe = (token) => {
    const el = document.createElement('div');
    el.style.display = 'none';
    el.style.backgroundColor = `var(${token})`;
    document.body.appendChild(el);
    return el;
  };
  const lightProbe = mkProbe('--color-primary-light');
  const softProbe = mkProbe('--color-primary-soft');

  const out = [];
  for (const a of accents) {
    for (const dark of [false, true]) {
      root.setAttribute('data-accent', a);
      root.classList.toggle('dark', dark);
      const v = read();
      const cs = getComputedStyle(root);
      const meta = {
        primary: cs.getPropertyValue(`--theme-${a}-primary`).trim(),
        surface: cs.getPropertyValue(`--theme-${a}-surface${dark ? '-dark' : ''}`).trim(),
      };
      const card = parse(v['--color-bg-card']) || [255, 255, 255, 1];
      const soft = over(parse(getComputedStyle(softProbe).backgroundColor), card);
      const light = over(parse(getComputedStyle(lightProbe).backgroundColor), card);
      const white = [255, 255, 255, 1];
      const probeVar = getComputedStyle(probe).getPropertyValue('--color-primary').trim();
      const probeBg = getComputedStyle(probe).backgroundColor;
      out.push({
        accent: a, mode: dark ? 'dark' : 'light', meta, probeVar, probeBg,
        c: {
          'solid/white': cr(parse(v['--color-primary-solid']), white),
          'solidHover/white': cr(parse(v['--color-primary-solid-hover']), white),
          'pText/soft': cr(parse(v['--color-primary-text']), soft),
          'pText/light': cr(parse(v['--color-primary-text']), light),
          'ink1': cr(parse(v['--ink-1']), card),
          'ink2': cr(parse(v['--ink-2']), card),
          'ink3': cr(parse(v['--ink-3']), card),
          'ink4': cr(parse(v['--ink-4']), card),
        },
        lightIs50: !dark ? v['--color-primary-light'] === v['--color-primary-50'] : (lum(light) < 0.5),
        ringFollows: v['--color-primary-ring'].includes(v['--color-primary']),
        elPrimary: v['--el-color-primary'],
        elInfo: v['--el-color-info'],
        primary: v['--color-primary'],
        solid: v['--color-primary-solid'],
        card: v['--color-bg-card'],
      });
    }
  }
  probe.remove();
  lightProbe.remove();
  softProbe.remove();
  return out;
}, ACCENTS);

await browser.close();

const fails = [...checkMapping()];
for (const c of cells) {
  const tag = `${c.accent}/${c.mode}`;
  const ok = (cond, msg) => { if (!cond) fails.push(`${tag}: ${msg}`); };
  ok(c.primary === c.meta.primary, `--color-primary(${c.primary}) ≠ --theme-*-primary(${c.meta.primary})`);
  ok(c.card === c.meta.surface, `--color-bg-card(${c.card}) ≠ 预览 surface(${c.meta.surface})`);
  ok(c.c['solid/white'] >= 4.5, `solid 白字 ${c.c['solid/white']} < 4.5`);
  ok(c.c['solidHover/white'] >= 4.5, `solid-hover 白字 ${c.c['solidHover/white']} < 4.5`);
  ok(c.c['pText/soft'] >= 4.5, `primary-text/soft ${c.c['pText/soft']} < 4.5`);
  ok(c.c['pText/light'] >= 4.5, `primary-text/light ${c.c['pText/light']} < 4.5`);
  ok(c.c.ink1 >= 4.5 && c.c.ink2 >= 4.5 && c.c.ink3 >= 4.5, `墨色 ${c.c.ink1}/${c.c.ink2}/${c.c.ink3} 有 <4.5`);
  ok(c.c.ink4 >= 3.8, `ink-4 ${c.c.ink4} < 3.8`);
  ok(c.lightIs50, `--color-primary-light 取档不一致（暗色可能白补丁）`);
  ok(c.ringFollows, `focus 环未跟随主色`);
  ok(c.elPrimary === c.primary, `EP 主色 ${c.elPrimary} ≠ 项目主色 ${c.primary}`);
  ok(c.probeVar === c.solid, `主按钮探针 --color-primary=${c.probeVar} ≠ solid=${c.solid}`);
  ok(c.elInfo === '#909399', `EP info 不再是中性灰（${c.elInfo}）`);
}

console.log(`主题守卫：${cells.length} 组（${ACCENTS.length} accent × 明暗）`);
console.table(cells.map((c) => ({
  主题: `${c.accent}/${c.mode}`,
  主色: c.primary,
  实底: c.solid,
  '白字/实底': c.c['solid/white'],
  '文字/soft': c.c['pText/soft'],
  '文字/light': c.c['pText/light'],
  ink4: c.c.ink4,
  按钮继承: c.probeVar === c.solid ? 'OK' : 'FAIL',
})));
if (pageErrors.length) fails.push('页面异常: ' + pageErrors.slice(0, 3).join(' | '));
if (fails.length) {
  console.error(`\n失败 ${fails.length} 项：`);
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n全部通过。');
