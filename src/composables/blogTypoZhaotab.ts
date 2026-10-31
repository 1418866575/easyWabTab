/* ============================================================
 * 找Tab（zhaotab.com/typeset）35 套排版主题移植 —— 由脚本生成，勿手改
 * 来源：Typeset 分包（id/name/accent/tags + 逐标签 CSS + 装饰函数）。
 * - tagStyles：逐标签原始 CSS（亮色画布设计；暗色降级为 --t-* 色彩 token）
 * - decor：标题/分割线/引用装饰（HTML 模板原样移植，前台经 DOM 装饰管线、
 *   公众号经 normalizeWechatBody 落成真实节点）
 * - ulMark/olMark/card 三类装饰未移植（涉及列表项改写与分卡容器）
 * ============================================================ */
import type { TypoDecor, TypoTheme } from './blogTypoCore'

const MONO = 'Menlo,Monaco,Consolas,"Courier New",monospace'

function pad2(n: number): string { return String(n).padStart(2, '0') }
const ZH_NUM = '壹贰叁肆伍陆柒捌玖拾'
function zhNum(n: number): string { return n <= 10 ? ZH_NUM[n - 1] : String(n) }
function dotSpan(color: string, size = 6): string {
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle;"></span>`
}
function barSpan(css: string, margin = ''): string {
  return `<span style="display:block;line-height:0;${margin}"><span style="display:inline-block;${css}"></span></span>`
}
function lineText(html: string, color: string, w = 28): string {
  const bar = `<span style="display:inline-block;width:${w}px;height:0;border-top:1px solid ${color};vertical-align:middle;"></span>`
  return `${bar}<span style="display:inline-block;margin:0 12px;vertical-align:middle;">${html}</span>${bar}`
}
function ribbon(color: string, side: 'left' | 'right'): string {
  const lines2 = `<span style="display:inline-block;line-height:0;vertical-align:middle;${side === 'left' ? 'text-align:right;' : 'text-align:left;'}"><span style="display:inline-block;width:36px;height:0;border-top:1px solid ${color};"></span><br><span style="display:inline-block;width:22px;height:0;margin-top:4px;border-top:1px solid ${color};"></span></span>`
  const ring = `<span style="display:inline-block;width:9px;height:9px;margin:0 -1px;border:1px solid ${color};border-${side === 'left' ? 'top' : 'bottom'}-color:transparent;border-radius:50%;vertical-align:middle;"></span>`
  return side === 'left' ? lines2 + ring : ring + lines2
}
function hrSection(text: string, color: string): string {
  return `<section style="margin:2em 0;text-align:center;color:${color};font-size:14px;letter-spacing:8px;line-height:1;">${text}</section>`
}

const DECORS: Record<string, TypoDecor> = {
  't_z_orange': {
    h2: e=>`<span style="display:inline-block;padding:5px 18px;border-radius:6px;background:#ef7060;color:#fff;box-shadow:3px 3px 0 #ffd2ca;">${e}</span>`,
    h3: e=>`<span style="display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background:#ef7060;vertical-align:middle;"></span>${e}`,
    hr: hrSection("● ● ●","#ef8171"),
  },
  't_z_mint': {
    h2: (e,t)=>`<span style="display:inline-block;margin-right:10px;padding:1px 8px;border-radius:6px;background:#12a182;color:#fff;font-size:15px;vertical-align:middle;">${pad2(t)}</span><span style="vertical-align:middle;">${e}</span>`,
    h3: e=>`<span style="color:#12a182;">▸ </span>${e}`,
    hr: hrSection("· · ·","#12a182"),
  },
  't_z_green': {
    h3: e=>`<span style="padding-bottom:2px;border-bottom:2px solid rgba(31,122,92,0.35);">${e}</span>`,
    hr: hrSection("· · ·","#1f7a5c"),
  },
  't_z_forest': {
    h2: e=>`<span style="display:inline-block;padding:0 4px 6px;border-bottom:2px solid #9ae6b4;">🌿 ${e}</span>`,
    hr: hrSection("~ 🌱 ~","#34b164"),
  },
  't_z_blue': {
    h2: e=>`<span style="display:inline-block;padding:5px 14px;border-radius:6px 6px 0 0;background:#2f6fde;color:#fff;">${e}</span>`,
    h3: e=>`<span style="color:#2f6fde;">▍</span>${e}`,
  },
  't_z_ocean': {
    h2: e=>`<span style="display:block;padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,#0b6bcb,#38bdf8);color:#fff;box-shadow:0 4px 12px rgba(11,107,203,0.25);">${e}</span>`,
    hr: hrSection("≈ ≈ ≈","#3ea8f0"),
  },
  't_z_violet': {
    h2: e=>`<span style="display:inline-block;padding:6px 22px;border-radius:999px;background:linear-gradient(90deg,#7c4dff,#b388ff);color:#fff;box-shadow:0 4px 12px rgba(124,77,255,0.3);">${e}</span>`,
    quoteMark: '<span style="display:block;height:22px;font-family:Georgia,serif;font-size:36px;line-height:1;color:#b388ff;">“</span>',
    hr: hrSection("✦ ✦ ✦","#b388ff"),
  },
  't_z_rose': {
    h2: e=>`<span style="display:inline-block;padding:0 6px 4px;border-bottom:2px solid #d9466f;">${e}</span>`,
    h3: e=>`<span style="padding:0 4px;background:linear-gradient(transparent 60%,rgba(217,70,111,0.2) 60%);">${e}</span>`,
    hr: hrSection("❀ ❀ ❀","#eb8ba6"),
  },
  't_z_sakura': {
    h2: e=>`<span style="display:inline-block;padding:6px 20px;border:1px solid #f5bccd;border-radius:20px;background:#fff;box-shadow:0 3px 0 #f5bccd;">${e}</span>`,
    h3: e=>`<span style="color:#e8769c;">✿ </span>${e}`,
    hr: hrSection("✿ ✿ ✿","#e8769c"),
  },
  't_z_lemon': {
    h2: e=>`<span style="padding:0 4px;background:linear-gradient(transparent 55%,#ffe066 55%);">${e}</span>`,
    h3: e=>`<span style="color:#ca9904;">▌</span>${e}`,
    hr: hrSection("🍋","#ca9904"),
  },
  't_z_notebook': {
    h2: e=>`<span style="display:inline-block;padding:4px 16px;border-left:3px dotted #fff;border-right:3px dotted #fff;background:rgba(255,212,59,0.6);">${e}</span>`,
    h3: e=>`<span style="padding-bottom:2px;border-bottom:2px dashed #f2c94c;">✎ ${e}</span>`,
    hr: hrSection("✂ - - - - - - - -","#be9a52"),
  },
  't_z_coffee': {
    h2: e=>`<span style="display:inline-block;width:10px;height:10px;margin-right:10px;border-radius:2px;background:#6f4e37;vertical-align:middle;"></span><span style="vertical-align:middle;">${e}</span>`,
    hr: hrSection("☕","#a67c52"),
  },
  't_z_ink': {
    h2: e=>`<span style="display:inline-block;padding:4px 18px;border-top:1px solid #8b5a2b;border-bottom:1px solid #8b5a2b;letter-spacing:2px;">${e}</span>`,
    hr: hrSection("· ✦ ·","#b08a5f"),
  },
  't_z_gold': {
    h2: e=>lineText(e,"#b8860b",32),
    h3: e=>`<span style="color:#b8860b;">◆ </span>${e}`,
    hr: hrSection("— ◆ —","#b8860b"),
  },
  't_z_grid': {
    h2: e=>`${ribbon("#4a6fa5","left")}<span style="display:inline-block;margin:0 10px;vertical-align:middle;">${e}</span>${ribbon("#4a6fa5","right")}`,
    h3: e=>`<span style="padding-bottom:2px;border-bottom:1px dashed #4a6fa5;">✎ ${e}</span>`,
    hr: hrSection("· · ✎ · ·","#8fa6c8"),
  },
  't_z_blush': {
    h2: e=>`<span style="display:block;">${e}</span><span style="display:block;margin-top:2px;font-size:11px;line-height:1;color:#d98b80;letter-spacing:0;">❦<span style="display:inline-block;width:76px;height:0;margin:0 4px;border-top:1px solid #d98b80;vertical-align:middle;"></span>❦</span>`,
    h3: e=>`<span style="color:#d98b80;">❀ </span>${e}`,
    quoteMark: '<span style="display:block;height:20px;font-family:Georgia,serif;font-size:30px;line-height:1;color:#d78c82;">“</span>',
    hr: hrSection("❦","#d98b80"),
  },
  't_z_festival': {
    h2: e=>`<span style="display:inline-block;padding:2px;border:1px solid #e9b949;"><span style="display:inline-block;padding:3px;background:#d9381e;"><span style="display:inline-block;padding:5px 18px;border:1px solid #f6d58e;color:#fff;letter-spacing:3px;"><span style="color:#f6d58e;font-size:10px;vertical-align:middle;">◆</span><span style="margin:0 12px;vertical-align:middle;">${e}</span><span style="color:#f6d58e;font-size:10px;vertical-align:middle;">◆</span></span></span></span>`,
    h3: e=>`<span style="color:#c89318;">◈ </span>${e}`,
    hr: hrSection("〜 ❖ 〜","#c89318"),
  },
  't_z_terminal': {
    h2: e=>`<span style="color:#60a5fa;">~</span><span style="color:#71717a;"> $ </span>${e}<span style="color:#4ade80;"> ▊</span>`,
    h3: e=>`<span style="color:#71717a;">&gt; </span>${e}`,
    quoteMark: `<span style="display:block;margin-bottom:2px;font-family:${MONO};font-size:12px;color:#71717a;">// note</span>`,
    hr: `<section style="margin:2em 0;font-family:${MONO};font-size:12px;line-height:1;color:#52525b;text-align:center;">/* ─────── */</section>`,
  },
  't_z_docs': {
    h2: e=>`<span style="margin-right:8px;color:#0969da;font-family:${MONO};">#</span>${e}`,
    h3: e=>`<span style="margin-right:6px;color:#8c959f;font-family:${MONO};">##</span>${e}`,
    quoteMark: '<span style="display:block;margin:4px 0 2px;color:#0969da;font-size:13px;font-weight:bold;">ⓘ Note</span>',
  },
  't_z_magazine': {
    h2: (e,t)=>`<span style="display:block;font-family:Georgia,serif;font-size:38px;font-weight:bold;font-style:italic;line-height:1;color:#e63946;letter-spacing:0;">${pad2(t)}</span><span style="display:block;margin-top:8px;padding-left:2px;">${e}</span>${barSpan("width:28px;height:3px;background:#e63946;","margin:10px 0 0 2px;")}`,
    h3: e=>`<span style="display:inline-block;width:8px;height:8px;margin-right:8px;background:#e63946;vertical-align:middle;"></span><span style="vertical-align:middle;">${e}</span>`,
    quoteMark: '<span style="display:block;height:28px;font-family:Georgia,serif;font-size:48px;line-height:1;color:#e63946;">“</span>',
    hr: '<section style="margin:2.2em 0;line-height:0;text-align:center;"><span style="display:inline-block;width:40px;height:3px;background:#1d3557;"></span><span style="display:inline-block;width:12px;height:3px;margin-left:6px;background:#e63946;"></span></section>',
  },
  't_z_pop': {
    h2: e=>`<span style="display:inline-block;padding:6px 16px;border:2px solid #111;background:#ffd23f;box-shadow:4px 4px 0 #111;">${e}</span>`,
    h3: e=>`<span style="padding:0 6px;border:2px solid #111;background:#a8e6cf;">${e}</span>`,
    hr: hrSection("▲ ● ■","#111"),
  },
  't_z_timeline': {
    h2: (e,t)=>`<span style="display:inline-block;width:26px;height:26px;margin:0 10px 0 -38px;border-radius:50%;background:#0891b2;color:#fff;font-size:13px;line-height:26px;text-align:center;letter-spacing:0;vertical-align:middle;box-shadow:0 0 0 4px #fff;">${t}</span><span style="vertical-align:middle;">${e}</span>`,
    h3: e=>`${dotSpan("#22d3ee",7)}<span style="margin-left:8px;vertical-align:middle;">${e}</span>`,
    hr: hrSection("◦ ◦ ◦","#33aec7"),
  },
  't_z_seal': {
    h1: e=>`『${e}』`,
    h2: (e,t)=>`<span style="display:inline-block;width:30px;height:30px;margin-right:12px;border-radius:4px;background:#b91c1c;color:#faf6ee;font-size:16px;line-height:30px;text-align:center;letter-spacing:0;vertical-align:middle;box-shadow:0 0 0 2px #faf6ee,0 0 0 3px #b91c1c;">${zhNum(t)}</span><span style="vertical-align:middle;">${e}</span>`,
    h3: e=>`<span style="color:#b91c1c;">〔</span>${e}<span style="color:#b91c1c;">〕</span>`,
    hr: hrSection("—— ◎ ——","#b7945c"),
  },
  't_z_whisper': {
    h2: (e,t)=>`<span style="display:block;font-size:11px;line-height:1;color:#a0a0a0;letter-spacing:4px;">— ${pad2(t)} —</span><span style="display:block;margin-top:10px;">${e}</span>`,
    quoteMark: '<span style="display:block;margin-bottom:6px;font-size:12px;line-height:1;color:#a0a0a0;letter-spacing:6px;">· · ·</span>',
    hr: hrSection("·","#a0a0a0"),
  },
  't_z_neon': {
    h2: e=>`<span style="display:inline-block;padding:6px 22px;border:1.5px solid #f472b6;border-radius:6px;box-shadow:0 0 10px #f472b6,inset 0 0 8px rgba(244,114,182,0.45);text-shadow:0 0 6px #f472b6;">${e}</span>`,
    hr: hrSection("✦ ━━ ✦ ━━ ✦","#a78bfa"),
  },
  't_z_kraft': {
    h2: e=>{const t=(n: string)=>`<span style="display:inline-block;width:0;height:0;border-top:18px solid #8f3f1f;border-bottom:18px solid #8f3f1f;border-${n}:12px solid transparent;vertical-align:middle;"></span>`;return`${t("left")}<span style="display:inline-block;padding:5px 20px;border-top:1px dashed rgba(255,248,236,0.6);border-bottom:1px dashed rgba(255,248,236,0.6);background:#b5562f;color:#fff8ec;line-height:24px;letter-spacing:2px;vertical-align:middle;">${e}</span>${t("right")}`},
    h3: e=>`<span style="display:inline-block;padding:1px 10px;border:1px dashed #b5562f;border-radius:3px;background:#fbf5ea;color:#8f3f1f;">${e}</span>`,
    hr: hrSection("· ✻ ·","#b5562f"),
  },
  't_z_briefing': {
    h2: (e,t)=>`<span style="display:block;padding-right:14px;background:#1e3a8a;line-height:38px;"><span style="display:inline-block;margin-right:12px;padding:0 12px;background:#f59e0b;color:#1e3a8a;letter-spacing:0;">${pad2(t)}</span>${e}</span>`,
    quoteMark: '<span style="display:block;margin-bottom:4px;font-size:12px;font-weight:bold;letter-spacing:2px;color:#1e3a8a;">▍要点</span>',
  },
  't_z_bubble': {
    h2: e=>`<span style="display:inline-block;width:34px;height:34px;margin-right:8px;border-radius:6px;background:#fff;font-size:18px;line-height:34px;text-align:center;vertical-align:middle;">💬</span><span style="display:inline-block;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:7px solid #95ec69;vertical-align:middle;"></span><span style="display:inline-block;max-width:75%;padding:8px 12px;border-radius:6px;background:#95ec69;font-weight:bold;text-align:left;vertical-align:middle;">${e}</span>`,
    h3: e=>`<span style="display:inline-block;padding:2px 10px;border-radius:4px;background:#e0e0e0;color:#7a7a7a;">${e}</span>`,
    hr: '<section style="margin:1.6em 0;font-size:12px;line-height:1;color:#939393;text-align:center;">—— 以下是新消息 ——</section>',
  },
  't_z_inkwash': {
    h2: (e,t)=>`<span style="display:block;font-size:30px;font-weight:normal;line-height:1;color:#7d8a90;letter-spacing:0;">${zhNum(t)}</span><span style="display:block;margin-top:10px;">${e}</span>${barSpan("width:60px;height:3px;border-radius:50%;background:linear-gradient(90deg,rgba(47,62,70,0),#2f3e46,rgba(47,62,70,0));","margin-top:10px;")}`,
    h3: e=>`<span style="color:#9a3b3b;">｜</span>${e}`,
    quoteMark: '<span style="display:block;height:24px;font-size:30px;line-height:1;color:#8e9da4;">〝</span>',
    hr: hrSection("～ ◦ ～","#909ca3"),
  },
  't_z_nordic': {
    h2: (e,t)=>`<span style="display:block;font-size:11px;font-weight:normal;line-height:1;color:#ad957a;letter-spacing:3px;">SECTION ${pad2(t)}</span><span style="display:block;margin-top:6px;">${e}</span>${barSpan("width:24px;height:3px;border-radius:2px;background:#7d9a83;","margin-top:8px;")}`,
    h3: e=>`<span style="display:inline-block;padding:1px 12px;border-radius:999px;background:#e3eae2;color:#4e6b55;">${e}</span>`,
    hr: hrSection("○ ○ ○","#aa9679"),
  },
  't_z_candy': {
    h2: e=>`<span style="display:inline-block;padding:3px;border-radius:999px;background:#ec4f8f;box-shadow:0 3px 0 #ffc2da;"><span style="display:inline-block;padding:4px 18px;border:2px dashed rgba(255,255,255,0.9);border-radius:999px;color:#fff;">★ ${e}</span></span>`,
    h3: e=>`<span style="color:#ff6ea9;">●</span><span style="color:#d49400;">●</span><span style="color:#13aaef;">●</span> ${e}`,
    hr: hrSection("★ ☆ ★","#ff6ea7"),
  },
  't_z_feed': {
    h2: e=>`<span style="display:inline-block;width:4px;height:16px;margin-right:8px;border-radius:2px;background:#f97316;vertical-align:-2px;"></span>${e}`,
    h3: e=>`<span style="color:#f97316;"># </span>${e}`,
  },
  't_z_checklist': {
    h2: (e,t)=>`<span style="display:inline-block;margin-right:10px;padding:2px 8px;border-radius:4px;background:#16a34a;color:#fff;font-size:12px;letter-spacing:1px;vertical-align:middle;">STEP ${pad2(t)}</span><span style="vertical-align:middle;">${e}</span>`,
    h3: e=>`<span style="color:#16a34a;">✓ </span>${e}`,
    quoteMark: '<span style="display:block;margin-bottom:4px;font-size:13px;font-weight:bold;color:#15803d;">💡 小贴士</span>',
    hr: hrSection("✓ ✓ ✓","#18b752"),
  },
}

export const ZHAOTAB_THEMES: TypoTheme[] = [
  {
    id: 't_z_simple',
    name: '简约',
    desc: '找Tab · news/business/tech',
    group: 'zhaotab',
    swatch: '#2b2b2b',
    tokens: {
      '--t-accent': '#2b2b2b',
      '--t-link': '#2b2b2b'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;padding-bottom:8px;border-bottom:1px solid #e3e3e3;font-size:18px;font-weight:bold;line-height:1.5;color:#222;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#444;",
      strong: "font-weight:bold;color:#000;",
      blockquote: "margin:1.4em 0;padding:10px 16px;border-left:3px solid #d0d0d0;color:#777;font-size:14px;",
    },
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#2b2b2b',
      '--t-link': '#2b2b2b',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#2b2b2b',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#2b2b2b',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_orange',
    name: '橙心',
    desc: '找Tab · life/event',
    group: 'zhaotab',
    swatch: '#ef7060',
    tokens: {
      '--t-accent': '#ef7060',
      '--t-link': '#ef7060'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;font-size:17px;font-weight:bold;line-height:1.5;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#ef7060;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border-radius:10px;background:#fff4f1;color:#7a5a55;font-size:14px;",
    },
    decor: DECORS['t_z_orange'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#ef7060',
      '--t-link': '#ef7060',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#ef7060',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#ef7060',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_mint',
    name: '薄荷',
    desc: '找Tab · tutorial/tech',
    group: 'zhaotab',
    swatch: '#12a182',
    tokens: {
      '--t-accent': '#12a182',
      '--t-link': '#12a182'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;padding-bottom:8px;border-bottom:1px dashed rgba(18,161,130,0.4);font-size:18px;font-weight:bold;line-height:1.5;color:#0e7c64;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#0e7c64;",
      strong: "font-weight:bold;color:#0e7c64;background:rgba(18,161,130,0.1);padding:0 2px;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border:1px solid rgba(18,161,130,0.25);border-radius:10px;background:#f0faf7;color:#4d6b63;font-size:14px;",
    },
    decor: DECORS['t_z_mint'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#12a182',
      '--t-link': '#12a182',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#12a182',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#12a182',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_green',
    name: '墨绿',
    desc: '找Tab · business/news',
    group: 'zhaotab',
    swatch: '#1f7a5c',
    tokens: {
      '--t-accent': '#1f7a5c',
      '--t-link': '#1f7a5c'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;padding:2px 0 2px 12px;border-left:5px solid #1f7a5c;font-size:18px;font-weight:bold;line-height:1.5;color:#1f7a5c;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#2a2a2a;",
    },
    decor: DECORS['t_z_green'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#1f7a5c',
      '--t-link': '#1f7a5c',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#1f7a5c',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#1f7a5c',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_forest',
    name: '森林',
    desc: '找Tab · emotion',
    group: 'zhaotab',
    swatch: '#2f855a',
    tokens: {
      '--t-accent': '#2f855a',
      '--t-link': '#2f855a'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;font-size:18px;font-weight:bold;line-height:1.5;color:#2f855a;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#276749;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border:1px solid #c6e6d2;border-radius:10px;background:#fff;color:#4a5d52;font-size:14px;",
      td: "padding:8px 10px;border:1px solid #c6e6d2;background:#fff;",
    },
    decor: DECORS['t_z_forest'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#2f855a',
      '--t-link': '#2f855a',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#2f855a',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#2f855a',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_blue',
    name: '科技蓝',
    desc: '找Tab · tech/tutorial',
    group: 'zhaotab',
    swatch: '#2f6fde',
    tokens: {
      '--t-accent': '#2f6fde',
      '--t-link': '#2f6fde'
    },
    tagStyles: {
      h1: "margin:1.2em 0 1.2em;font-size:22px;font-weight:bold;line-height:1.5;color:#2f6fde;text-align:center;",
      h2: "margin:2em 0 1.1em;border-bottom:2px solid #2f6fde;font-size:17px;font-weight:bold;line-height:1.5;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#2f6fde;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border-radius:8px;background:#f0f5ff;color:#4a5b78;font-size:14px;",
    },
    decor: DECORS['t_z_blue'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#2f6fde',
      '--t-link': '#2f6fde',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#2f6fde',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#2f6fde',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_ocean',
    name: '海洋',
    desc: '找Tab · tech/business',
    group: 'zhaotab',
    swatch: '#0b6bcb',
    tokens: {
      '--t-accent': '#0b6bcb',
      '--t-link': '#0b6bcb'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;font-size:17px;font-weight:bold;line-height:1.5;",
      h3: "margin:1.6em 0 0.8em;padding-left:10px;border-left:4px solid #38bdf8;font-size:16px;font-weight:bold;line-height:1.5;color:#0b6bcb;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border-left:4px solid #38bdf8;border-radius:0 8px 8px 0;background:#eef7ff;color:#475f78;font-size:14px;",
      th: "padding:8px 10px;border:1px solid #0b6bcb;background:#0b6bcb;color:#fff;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #cfe3f7;",
    },
    decor: DECORS['t_z_ocean'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#0b6bcb',
      '--t-link': '#0b6bcb',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#0b6bcb',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#0b6bcb',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_violet',
    name: '紫罗兰',
    desc: '找Tab · event/emotion',
    group: 'zhaotab',
    swatch: '#7c4dff',
    tokens: {
      '--t-accent': '#7c4dff',
      '--t-link': '#7c4dff'
    },
    tagStyles: {
      h1: "margin:1.2em 0 1.2em;font-size:22px;font-weight:bold;line-height:1.5;color:#5b2fd6;text-align:center;",
      h2: "margin:2em 0 1.1em;font-size:17px;font-weight:bold;line-height:1.5;text-align:center;",
      h3: "margin:1.6em 0 0.8em;padding-left:10px;border-left:4px solid #b388ff;font-size:16px;font-weight:bold;line-height:1.5;color:#5b2fd6;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border-radius:10px;background:#f5f0ff;color:#5e5577;font-size:14px;",
    },
    decor: DECORS['t_z_violet'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#7c4dff',
      '--t-link': '#7c4dff',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#7c4dff',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#7c4dff',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_rose',
    name: '玫瑰',
    desc: '找Tab · emotion/event',
    group: 'zhaotab',
    swatch: '#d9466f',
    tokens: {
      '--t-accent': '#d9466f',
      '--t-link': '#d9466f'
    },
    tagStyles: {
      h1: "margin:1.2em 0 1.2em;font-size:22px;font-weight:bold;line-height:1.5;color:#d9466f;text-align:center;",
      h2: "margin:2em 0 1.1em;font-size:18px;font-weight:bold;line-height:1.5;color:#d9466f;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#333;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border-radius:8px;background:rgba(217,70,111,0.06);color:#666;font-size:14px;",
    },
    decor: DECORS['t_z_rose'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#d9466f',
      '--t-link': '#d9466f',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#d9466f',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#d9466f',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_sakura',
    name: '樱花',
    desc: '找Tab · emotion/event',
    group: 'zhaotab',
    swatch: '#e5739a',
    tokens: {
      '--t-accent': '#e5739a',
      '--t-link': '#e5739a'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;font-size:17px;font-weight:bold;line-height:1.5;color:#e5739a;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#d45d87;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border:1px dashed #f0a6bf;border-radius:12px;background:#fff;color:#7a6168;font-size:14px;",
      td: "padding:8px 10px;border:1px solid #f6c9d8;background:#fff;",
    },
    decor: DECORS['t_z_sakura'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#e5739a',
      '--t-link': '#e5739a',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#e5739a',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#e5739a',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_lemon',
    name: '柠檬',
    desc: '找Tab · tutorial',
    group: 'zhaotab',
    swatch: '#d4a106',
    tokens: {
      '--t-accent': '#d4a106',
      '--t-link': '#d4a106'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;font-size:18px;font-weight:bold;line-height:1.5;color:#222;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#333;",
      strong: "font-weight:bold;color:#222;background:linear-gradient(transparent 55%,#ffe066 55%);padding:0 2px;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border-left:4px solid #ffd43b;border-radius:0 8px 8px 0;background:#fffbea;color:#6b5d2e;font-size:14px;",
      code: "margin:0 2px;padding:2px 5px;border-radius:4px;background:#fff3bf;color:#8a6d00;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:90%;",
    },
    decor: DECORS['t_z_lemon'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#d4a106',
      '--t-link': '#d4a106',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#d4a106',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#d4a106',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_notebook',
    name: '手账',
    desc: '找Tab · tutorial/life',
    group: 'zhaotab',
    swatch: '#e8590c',
    tokens: {
      '--t-accent': '#e8590c',
      '--t-link': '#e8590c'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;font-size:17px;font-weight:bold;line-height:1.5;color:#5c3d00;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#5c3d00;",
      strong: "font-weight:bold;color:#e8590c;border-bottom:2px dotted #e8590c;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border:1.5px dashed #f2c94c;border-radius:12px;background:#fffbe6;color:#6b5a3a;font-size:14px;",
    },
    decor: DECORS['t_z_notebook'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#e8590c',
      '--t-link': '#e8590c',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#e8590c',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#e8590c',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_coffee',
    name: '咖啡',
    desc: '找Tab · life/culture',
    group: 'zhaotab',
    swatch: '#6f4e37',
    tokens: {
      '--t-accent': '#6f4e37',
      '--t-link': '#6f4e37'
    },
    tagStyles: {
      h2: "margin:2em 0 1.1em;padding-bottom:8px;border-bottom:1px dashed #c9b29b;font-size:18px;font-weight:bold;line-height:1.5;color:#6f4e37;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#8b5e3c;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border-left:4px solid #a67c52;border-radius:0 6px 6px 0;background:#f7f1ea;color:#6b5848;font-size:14px;",
    },
    decor: DECORS['t_z_coffee'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#6f4e37',
      '--t-link': '#6f4e37',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#6f4e37',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#6f4e37',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_ink',
    name: '书香',
    desc: '找Tab · culture/emotion',
    group: 'zhaotab',
    swatch: '#8b5a2b',
    tokens: {
      '--t-accent': '#8b5a2b',
      '--t-link': '#8b5a2b'
    },
    tagStyles: {
      p: "margin:1em 0;text-indent:2em;",
      h1: "margin:1.2em 0 1.2em;font-size:23px;font-weight:bold;line-height:1.5;color:#5a3a1c;text-align:center;letter-spacing:2px;",
      h2: "margin:2em 0 1.2em;font-size:19px;font-weight:bold;line-height:1.5;color:#5a3a1c;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:17px;font-weight:bold;line-height:1.5;color:#5a3a1c;",
      blockquote: "margin:1.4em 0;padding:12px 16px;border-left:3px solid #c9a27a;background:#f3ebdd;color:#6b5b4b;font-size:15px;",
    },
    decor: DECORS['t_z_ink'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#8b5a2b',
      '--t-link': '#8b5a2b',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#8b5a2b',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#8b5a2b',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_gold',
    name: '黑金',
    desc: '找Tab · business/event',
    group: 'zhaotab',
    swatch: '#b8860b',
    tokens: {
      '--t-accent': '#b8860b',
      '--t-link': '#b8860b'
    },
    tagStyles: {
      h1: "margin:1.2em 0 1.2em;font-size:22px;font-weight:bold;line-height:1.5;color:#111;text-align:center;letter-spacing:3px;",
      h2: "margin:2em 0 1.1em;font-size:18px;font-weight:bold;line-height:1.5;color:#111;text-align:center;letter-spacing:2px;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#111;",
      blockquote: "margin:1.4em 0;padding:14px 18px;border-left:2px solid #b8860b;background:#faf8f2;color:#5c5546;font-size:14px;",
      th: "padding:8px 10px;border:1px solid #222;background:#222;color:#e8c46a;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #e5dcc3;",
    },
    decor: DECORS['t_z_gold'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#b8860b',
      '--t-link': '#b8860b',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#b8860b',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#b8860b',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_news',
    name: '报纸',
    desc: '找Tab · news/culture',
    group: 'zhaotab',
    swatch: '#111111',
    tokens: {
      '--t-accent': '#111111',
      '--t-link': '#111111'
    },
    tagStyles: {
      h1: "margin:1em 0 1.2em;padding:10px 0;border-top:3px double #111;border-bottom:3px double #111;font-size:24px;font-weight:bold;line-height:1.4;color:#111;text-align:center;",
      h2: "margin:2em 0 1em;padding-bottom:4px;border-bottom:2px solid #111;font-size:19px;font-weight:bold;line-height:1.5;color:#111;",
      h3: "margin:1.6em 0 0.8em;font-size:17px;font-weight:bold;font-style:italic;line-height:1.5;color:#111;",
      strong: "font-weight:bold;color:#000;",
      blockquote: "margin:1.6em 0;padding:12px 8px;border-top:1px solid #111;border-bottom:1px solid #111;color:#333;font-size:16px;font-style:italic;text-align:center;",
      th: "padding:8px 10px;border-bottom:2px solid #111;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border-bottom:1px solid #ccc;",
      hr: "margin:2em 0;height:0;border:0;border-top:3px double #111;",
    },
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#111111',
      '--t-link': '#111111',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#111111',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#111111',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_grid',
    name: '方格本',
    desc: '找Tab · tutorial/life',
    group: 'zhaotab',
    swatch: '#4a6fa5',
    tokens: {
      '--t-accent': '#4a6fa5',
      '--t-link': '#4a6fa5'
    },
    tagStyles: {
      h2: "margin:2em 0 1.2em;font-size:17px;font-weight:bold;line-height:1.5;color:#2f4b75;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#2f4b75;",
      strong: "font-weight:bold;color:#2f4b75;background:rgba(74,111,165,0.12);padding:0 3px;",
      blockquote: "margin:1.4em 0;padding:12px 16px;border:1px solid rgba(74,111,165,0.35);border-radius:4px;background:#fff;box-shadow:3px 3px 0 rgba(74,111,165,0.15);color:#5a6a80;font-size:14px;",
    },
    decor: DECORS['t_z_grid'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#4a6fa5',
      '--t-link': '#4a6fa5',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#4a6fa5',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#4a6fa5',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_blush',
    name: '粉笺',
    desc: '找Tab · emotion/life',
    group: 'zhaotab',
    swatch: '#a33b32',
    tokens: {
      '--t-accent': '#a33b32',
      '--t-link': '#a33b32'
    },
    tagStyles: {
      p: "margin:0.9em 0;",
      h2: "margin:2em 0 1em;font-size:16px;font-weight:bold;line-height:1.5;color:#8b2f28;text-align:center;letter-spacing:2px;",
      h3: "margin:1.4em 0 0.6em;font-size:15px;font-weight:bold;line-height:1.5;color:#8b2f28;",
      strong: "font-weight:bold;color:#222;",
      blockquote: "margin:1em 0;padding:12px 14px;border-radius:4px;background:#fff;color:#7a5a55;font-size:14px;",
    },
    decor: DECORS['t_z_blush'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#a33b32',
      '--t-link': '#a33b32',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#a33b32',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#a33b32',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_festival',
    name: '国潮',
    desc: '找Tab · event',
    group: 'zhaotab',
    swatch: '#d9381e',
    tokens: {
      '--t-accent': '#d9381e',
      '--t-link': '#d9381e'
    },
    tagStyles: {
      h1: "margin:1.2em 0 1.2em;font-size:22px;font-weight:bold;line-height:1.5;color:#c92a1a;text-align:center;letter-spacing:3px;",
      h2: "margin:2.2em 0 1.2em;font-size:16px;font-weight:bold;line-height:1.5;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#c92a1a;",
      strong: "font-weight:bold;color:#d9381e;",
      blockquote: "margin:1.6em 0;padding:16px 18px;border:1px solid #e9b949;background:#fff3df;box-shadow:inset 0 0 0 3px #fff3df,inset 0 0 0 4px #f1cf85;color:#9a4a22;font-size:14px;",
      th: "padding:8px 10px;border:1px solid #e9b949;background:#d9381e;color:#ffe9b3;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #f1cf85;background:#fff;",
    },
    decor: DECORS['t_z_festival'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#d9381e',
      '--t-link': '#d9381e',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#d9381e',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#d9381e',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_terminal',
    name: '终端',
    desc: '找Tab · tech',
    group: 'zhaotab',
    swatch: '#4ade80',
    tokens: {
      '--t-accent': '#4ade80',
      '--t-link': '#4ade80'
    },
    tagStyles: {
      h1: "margin:1em 0 1.2em;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:20px;font-weight:bold;line-height:1.5;color:#fafafa;text-align:left;letter-spacing:0;",
      h2: "margin:2em 0 1em;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:16px;font-weight:bold;line-height:1.5;color:#4ade80;letter-spacing:0;",
      h3: "margin:1.6em 0 0.8em;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:15px;font-weight:bold;line-height:1.5;color:#e4e4e7;letter-spacing:0;",
      strong: "font-weight:bold;color:#facc15;",
      blockquote: "margin:1.4em 0;padding:10px 14px;border-left:2px solid #4ade80;background:#26272e;color:#a1a1aa;font-size:14px;",
      code: "margin:0 2px;padding:2px 5px;border-radius:4px;background:#2e3038;color:#f472b6;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:90%;",
      pre: "margin:1.4em 0;border:1px solid #33353d;border-radius:8px;background:#15161a;overflow-x:auto;",
      th: "padding:8px 10px;border:1px solid #3a3d46;background:#26272e;color:#e4e4e7;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #3a3d46;",
    },
    decor: DECORS['t_z_terminal'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#4ade80',
      '--t-link': '#4ade80',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#4ade80',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#4ade80',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_docs',
    name: '文档',
    desc: '找Tab · tech/tutorial',
    group: 'zhaotab',
    swatch: '#0969da',
    tokens: {
      '--t-accent': '#0969da',
      '--t-link': '#0969da'
    },
    tagStyles: {
      h1: "margin:1em 0 1em;padding-bottom:8px;border-bottom:1px solid #d8dee4;font-size:22px;font-weight:bold;line-height:1.4;color:#1f2328;",
      h2: "margin:1.8em 0 1em;padding-bottom:6px;border-bottom:1px solid #d8dee4;font-size:18px;font-weight:bold;line-height:1.5;color:#1f2328;",
      h3: "margin:1.5em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#1f2328;",
      strong: "font-weight:bold;color:#1f2328;",
      blockquote: "margin:1.4em 0;padding:4px 14px;border-left:4px solid #0969da;color:#57606a;font-size:14px;",
      code: "margin:0 2px;padding:2px 5px;border-radius:5px;background:rgba(175,184,193,0.25);color:#1f2328;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:88%;",
      th: "padding:8px 10px;border:1px solid #d0d7de;background:#f6f8fa;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #d0d7de;",
      hr: "margin:2em 0;height:0;border:0;border-top:3px solid #d8dee4;",
    },
    decor: DECORS['t_z_docs'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#0969da',
      '--t-link': '#0969da',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#0969da',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#0969da',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_magazine',
    name: '杂志',
    desc: '找Tab · news/business/culture',
    group: 'zhaotab',
    swatch: '#e63946',
    tokens: {
      '--t-accent': '#e63946',
      '--t-link': '#e63946'
    },
    tagStyles: {
      h1: "margin:1em 0 1.2em;font-family:Georgia,\"Songti SC\",\"STSong\",\"SimSun\",serif;font-size:24px;font-weight:bold;line-height:1.4;color:#1d3557;letter-spacing:1px;",
      h2: "margin:2.2em 0 1em;font-size:20px;font-weight:bold;line-height:1.4;color:#1d3557;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#1d3557;",
      strong: "font-weight:bold;color:#1d3557;",
      blockquote: "margin:1.8em 0;padding:4px 12px 8px;color:#1d3557;font-family:Georgia,\"Songti SC\",\"STSong\",\"SimSun\",serif;font-size:17px;font-weight:bold;line-height:1.7;text-align:center;",
      th: "padding:8px 10px;border-bottom:2px solid #1d3557;font-weight:bold;text-align:left;color:#1d3557;",
      td: "padding:8px 10px;border-bottom:1px solid #e3e6ea;",
    },
    decor: DECORS['t_z_magazine'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#e63946',
      '--t-link': '#e63946',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#e63946',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#e63946',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_pop',
    name: '波普',
    desc: '找Tab · life/event',
    group: 'zhaotab',
    swatch: '#ff5a36',
    tokens: {
      '--t-accent': '#ff5a36',
      '--t-link': '#ff5a36'
    },
    tagStyles: {
      h1: "margin:1em 0 1.2em;font-size:23px;font-weight:900;line-height:1.4;color:#111;text-align:center;",
      h2: "margin:2em 0 1.2em;font-size:17px;font-weight:900;line-height:1.5;color:#111;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#111;",
      strong: "font-weight:bold;color:#111;background:#ffd23f;padding:0 3px;",
      blockquote: "margin:1.6em 0;padding:12px 16px;border:2px solid #111;background:#fff;box-shadow:4px 4px 0 #111;color:#333;font-size:14px;",
      code: "margin:0 2px;padding:1px 5px;border:1.5px solid #111;border-radius:4px;background:#ffe3ec;color:#111;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:88%;",
      pre: "margin:1.6em 0;border:2px solid #111;border-radius:6px;background:#282c34;overflow-x:auto;box-shadow:4px 4px 0 #111;",
      th: "padding:8px 10px;border:2px solid #111;background:#111;color:#ffd23f;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:2px solid #111;background:#fff;",
    },
    decor: DECORS['t_z_pop'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#ff5a36',
      '--t-link': '#ff5a36',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#ff5a36',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#ff5a36',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_timeline',
    name: '时间轴',
    desc: '找Tab · tutorial/news/business',
    group: 'zhaotab',
    swatch: '#0891b2',
    tokens: {
      '--t-accent': '#0891b2',
      '--t-link': '#0891b2'
    },
    tagStyles: {
      h2: "margin:0.8em 0 0.8em;font-size:17px;font-weight:bold;line-height:1.5;color:#0e7490;",
      h3: "margin:1.4em 0 0.6em;font-size:16px;font-weight:bold;line-height:1.5;color:#155e75;",
      blockquote: "margin:1.2em 0;padding:12px 14px;border-radius:8px;background:#ecfeff;color:#4b6670;font-size:14px;",
    },
    decor: DECORS['t_z_timeline'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#0891b2',
      '--t-link': '#0891b2',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#0891b2',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#0891b2',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_seal',
    name: '朱印',
    desc: '找Tab · culture/event',
    group: 'zhaotab',
    swatch: '#b91c1c',
    tokens: {
      '--t-accent': '#b91c1c',
      '--t-link': '#b91c1c'
    },
    tagStyles: {
      h1: "margin:1em 0 1.2em;font-size:23px;font-weight:bold;line-height:1.5;color:#2b2419;text-align:center;letter-spacing:4px;",
      h2: "margin:2em 0 1em;font-size:18px;font-weight:bold;line-height:1.5;color:#2b2419;letter-spacing:2px;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#2b2419;",
      strong: "font-weight:bold;color:#b91c1c;",
      blockquote: "margin:1.4em 0;padding:12px 16px;border-left:2px solid #b91c1c;background:#f3ecdd;color:#6b5b45;font-size:15px;",
      th: "padding:8px 10px;border:1px solid #d6c7a8;background:#efe6d3;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #d6c7a8;",
    },
    decor: DECORS['t_z_seal'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#b91c1c',
      '--t-link': '#b91c1c',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#b91c1c',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#b91c1c',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_whisper',
    name: '留白',
    desc: '找Tab · emotion/culture',
    group: 'zhaotab',
    swatch: '#8a8f98',
    tokens: {
      '--t-accent': '#8a8f98',
      '--t-link': '#8a8f98'
    },
    tagStyles: {
      p: "margin:1.5em 0;",
      h1: "margin:1.2em 0 1.6em;font-size:21px;font-weight:normal;line-height:1.6;color:#222;text-align:center;letter-spacing:4px;",
      h2: "margin:2.6em 0 1.6em;font-size:16px;font-weight:normal;line-height:1.6;color:#222;text-align:center;letter-spacing:3px;",
      h3: "margin:2em 0 1em;font-size:15px;font-weight:bold;line-height:1.6;color:#333;",
      strong: "font-weight:bold;color:#222;",
      blockquote: "margin:2.2em 0;padding:0 1.2em;color:#999;font-size:14px;text-align:center;",
      code: "margin:0 2px;padding:2px 5px;border-radius:4px;background:#f3f3f3;color:#666;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:90%;",
      th: "padding:8px 10px;border-bottom:1px solid #ddd;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border-bottom:1px solid #eee;",
    },
    decor: DECORS['t_z_whisper'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#8a8f98',
      '--t-link': '#8a8f98',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#8a8f98',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#8a8f98',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_neon',
    name: '霓虹',
    desc: '找Tab · tech/event',
    group: 'zhaotab',
    swatch: '#f472b6',
    tokens: {
      '--t-accent': '#f472b6',
      '--t-link': '#f472b6'
    },
    tagStyles: {
      h1: "margin:1em 0 1.2em;font-size:22px;font-weight:bold;line-height:1.5;color:#fff;text-align:center;text-shadow:0 0 8px #f472b6;",
      h2: "margin:2.2em 0 1.2em;font-size:17px;font-weight:bold;line-height:1.5;color:#fff;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#67e8f9;text-shadow:0 0 6px rgba(34,211,238,0.6);",
      strong: "font-weight:bold;color:#67e8f9;",
      blockquote: "margin:1.4em 0;padding:12px 16px;border-left:3px solid #a78bfa;border-radius:0 8px 8px 0;background:rgba(167,139,250,0.1);color:#c4b5fd;font-size:14px;",
      code: "margin:0 2px;padding:2px 5px;border-radius:4px;background:rgba(244,114,182,0.14);color:#f9a8d4;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:90%;",
      pre: "margin:1.4em 0;border:1px solid #3b2f6b;border-radius:8px;background:#0b0918;overflow-x:auto;box-shadow:0 0 12px rgba(167,139,250,0.25);",
      th: "padding:8px 10px;border:1px solid #3b2f6b;background:rgba(167,139,250,0.16);color:#e9d5ff;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #3b2f6b;",
    },
    decor: DECORS['t_z_neon'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#f472b6',
      '--t-link': '#f472b6',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#f472b6',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#f472b6',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_kraft',
    name: '牛皮纸',
    desc: '找Tab · life/culture',
    group: 'zhaotab',
    swatch: '#b5562f',
    tokens: {
      '--t-accent': '#b5562f',
      '--t-link': '#b5562f'
    },
    tagStyles: {
      h2: "margin:2.2em 0 1.2em;font-size:16px;font-weight:bold;line-height:1.5;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:15px;font-weight:bold;line-height:1.5;",
      strong: "font-weight:bold;color:#8f3f1f;",
      blockquote: "margin:1.4em 0;padding:12px 16px;border:1px dashed #c9a77c;border-radius:4px;background:#fbf5ea;color:#6b5843;font-size:14px;",
      code: "margin:0 2px;padding:2px 5px;border-radius:4px;background:#ead8b8;color:#7a3a1a;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:90%;",
      th: "padding:8px 10px;border:1px solid #d8bf98;background:#e8d5b2;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #d8bf98;background:#fbf5ea;",
    },
    decor: DECORS['t_z_kraft'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#b5562f',
      '--t-link': '#b5562f',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#b5562f',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#b5562f',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_briefing',
    name: '简报',
    desc: '找Tab · business/news',
    group: 'zhaotab',
    swatch: '#1e3a8a',
    tokens: {
      '--t-accent': '#1e3a8a',
      '--t-link': '#1e3a8a'
    },
    tagStyles: {
      h1: "margin:1em 0 1.2em;font-size:22px;font-weight:bold;line-height:1.5;color:#1e3a8a;",
      h2: "margin:2em 0 1em;font-size:16px;font-weight:bold;line-height:1.5;color:#fff;",
      h3: "margin:1.6em 0 0.8em;padding-left:10px;border-left:4px solid #f59e0b;font-size:16px;font-weight:bold;line-height:1.4;color:#1e3a8a;",
      strong: "font-weight:bold;color:#1e3a8a;",
      blockquote: "margin:1.4em 0;padding:12px 16px;border-top:3px solid #1e3a8a;background:#eff3fb;color:#334155;font-size:14px;",
      th: "padding:8px 10px;border:1px solid #1e3a8a;background:#1e3a8a;color:#fff;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #cbd5e1;",
      hr: "margin:2em 0;height:0;border:0;border-top:1px solid #cbd5e1;",
    },
    decor: DECORS['t_z_briefing'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#1e3a8a',
      '--t-link': '#1e3a8a',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#1e3a8a',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#1e3a8a',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_bubble',
    name: '对话框',
    desc: '找Tab · emotion/life',
    group: 'zhaotab',
    swatch: '#07c160',
    tokens: {
      '--t-accent': '#07c160',
      '--t-link': '#07c160'
    },
    tagStyles: {
      h1: "margin:0.6em 0 1.2em;font-size:20px;font-weight:bold;line-height:1.5;color:#111;text-align:center;",
      h2: "margin:1.8em 0 1em;font-size:15px;font-weight:normal;line-height:1.6;color:#111;",
      h3: "margin:1.6em 0 0.8em;font-size:12px;font-weight:normal;line-height:1.6;text-align:center;",
      strong: "font-weight:bold;color:#06ad56;",
      blockquote: "margin:1.2em 0;padding:10px 14px;border-radius:6px;background:#fff;color:#333;font-size:14px;",
      code: "margin:0 2px;padding:2px 5px;border-radius:4px;background:#fff;color:#06ad56;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:90%;",
      th: "padding:8px 10px;border:1px solid #d5d5d5;background:#f7f7f7;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #d5d5d5;background:#fff;",
    },
    decor: DECORS['t_z_bubble'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#07c160',
      '--t-link': '#07c160',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#07c160',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#07c160',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_inkwash',
    name: '水墨',
    desc: '找Tab · culture/emotion',
    group: 'zhaotab',
    swatch: '#2f3e46',
    tokens: {
      '--t-accent': '#2f3e46',
      '--t-link': '#2f3e46'
    },
    tagStyles: {
      h1: "margin:1em 0 1.4em;font-size:23px;font-weight:bold;line-height:1.5;color:#1f2a30;text-align:center;letter-spacing:6px;",
      h2: "margin:2.4em 0 1.2em;font-size:19px;font-weight:bold;line-height:1.5;color:#1f2a30;text-align:center;letter-spacing:3px;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#1f2a30;",
      strong: "font-weight:bold;color:#1f2a30;border-bottom:1px solid #8a9aa2;",
      blockquote: "margin:1.8em 0;padding:0 1em;color:#5f6b70;font-size:15px;text-align:center;",
      th: "padding:8px 10px;border-bottom:1px solid #2f3e46;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border-bottom:1px solid #dde1e3;",
    },
    decor: DECORS['t_z_inkwash'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#2f3e46',
      '--t-link': '#2f3e46',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#2f3e46',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#2f3e46',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_nordic',
    name: '北欧',
    desc: '找Tab · life/emotion',
    group: 'zhaotab',
    swatch: '#7d9a83',
    tokens: {
      '--t-accent': '#7d9a83',
      '--t-link': '#7d9a83'
    },
    tagStyles: {
      h2: "margin:2.2em 0 1em;font-size:18px;font-weight:bold;line-height:1.5;color:#3f3a33;",
      h3: "margin:1.6em 0 0.8em;font-size:15px;font-weight:bold;line-height:1.5;",
      strong: "font-weight:bold;color:#4e6b55;",
      blockquote: "margin:1.4em 0;padding:14px 18px;border-radius:14px;background:#fff;color:#6b6459;font-size:14px;",
      code: "margin:0 2px;padding:2px 6px;border-radius:6px;background:#e9eee6;color:#4e6b55;font-family:Menlo,Monaco,Consolas,\"Courier New\",monospace;font-size:90%;",
      th: "padding:8px 10px;border-bottom:1px solid #d9d2c5;background:#efe9df;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border-bottom:1px solid #e6e0d5;background:#fff;",
    },
    decor: DECORS['t_z_nordic'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#7d9a83',
      '--t-link': '#7d9a83',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#7d9a83',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#7d9a83',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_candy',
    name: '糖果',
    desc: '找Tab · life/event',
    group: 'zhaotab',
    swatch: '#ff5c9d',
    tokens: {
      '--t-accent': '#ff5c9d',
      '--t-link': '#ff5c9d'
    },
    tagStyles: {
      h2: "margin:2em 0 1.2em;font-size:16px;font-weight:bold;line-height:1.5;text-align:center;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#444;",
      blockquote: "margin:1.4em 0;padding:14px 16px;border:2px dashed #9bd6f5;border-radius:16px;background:#f0f9ff;color:#4a6b80;font-size:14px;",
      th: "padding:8px 10px;border:1px solid #ffd1e3;background:#fff0f6;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #ffe0ec;",
    },
    decor: DECORS['t_z_candy'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#ff5c9d',
      '--t-link': '#ff5c9d',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#ff5c9d',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#ff5c9d',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_feed',
    name: '卡片流',
    desc: '找Tab · news/tutorial',
    group: 'zhaotab',
    swatch: '#f97316',
    tokens: {
      '--t-accent': '#f97316',
      '--t-link': '#f97316'
    },
    tagStyles: {
      h1: "margin:0.6em 0 0.8em;padding:0 6px;font-size:21px;font-weight:bold;line-height:1.5;color:#222;",
      h2: "margin:0.8em 0 0.6em;padding-bottom:10px;border-bottom:1px solid #f0f0f0;font-size:17px;font-weight:bold;line-height:1.5;color:#222;",
      h3: "margin:1.4em 0 0.6em;font-size:15px;font-weight:bold;line-height:1.5;color:#333;",
      blockquote: "margin:1.2em 0;padding:12px 14px;border-radius:8px;background:#f7f8fa;color:#666;font-size:14px;",
      hr: "margin:1.6em 0;height:0;border:0;border-top:1px dashed #e5e5e5;",
    },
    decor: DECORS['t_z_feed'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#f97316',
      '--t-link': '#f97316',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#f97316',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#f97316',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
  {
    id: 't_z_checklist',
    name: '清单',
    desc: '找Tab · tutorial',
    group: 'zhaotab',
    swatch: '#16a34a',
    tokens: {
      '--t-accent': '#16a34a',
      '--t-link': '#16a34a'
    },
    tagStyles: {
      h2: "margin:2em 0 1em;font-size:17px;font-weight:bold;line-height:1.5;color:#14532d;",
      h3: "margin:1.6em 0 0.8em;font-size:16px;font-weight:bold;line-height:1.5;color:#166534;",
      strong: "font-weight:bold;color:#15803d;",
      blockquote: "margin:1.4em 0;padding:12px 16px;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4;color:#3f6150;font-size:14px;",
      th: "padding:8px 10px;border:1px solid #bbf7d0;background:#dcfce7;font-weight:bold;text-align:left;",
      td: "padding:8px 10px;border:1px solid #d1fae5;",
    },
    decor: DECORS['t_z_checklist'],
    dark: {
      '--t-text': '#cbd5e1',
      '--t-heading': '#f1f5f9',
      '--t-accent': '#16a34a',
      '--t-link': '#16a34a',
      '--t-quote-bg': 'rgba(255,255,255,0.04)',
      '--t-quote-border': '#16a34a',
      '--t-quote-text': '#94a3b8',
      '--t-code-bg': 'rgba(255,255,255,0.08)',
      '--t-code-color': '#16a34a',
      '--t-pre-bg': 'rgba(255,255,255,0.06)',
      '--t-pre-color': '#cbd5e1'
    }
  },
]
