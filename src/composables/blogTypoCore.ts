/**
 * 博客文章排版主题（纯逻辑，零 vue / 零 DOM，node --experimental-strip-types 可测）
 * ------------------------------------------------------------------
 * 方案见 docs/博客-文章样式编排-技术方案.md。
 * 主题 = 一组 `--t-*` Token，三个消费端各自取用：
 *   - 编辑器预览 / 博客前台：typoVars() 输出 style 对象注入 .md-body 容器，
 *     markdown.css 全部改读 --t-*（fallback = 现值，保证「跟随系统」零回归）
 *   - 公众号：typoInlineStyle() 按 tag 生成内联 style（公众号不认 class/伪元素）
 *
 * 锚点：classic 主题的输出必须与旧 useWechatPublish.styleFor() 逐字节一致
 *（test-blog-typo.ts 里有快照断言），这是整条公众号链路不回归的保证。
 */
import type { BlogTypo } from '../types'

export type TypoGroup = 'color' | 'simple' | 'wechat'

export interface TypoTheme {
  id: string
  name: string
  desc: string
  /** 弹框顶部分类药丸的分组 */
  group: TypoGroup
  /** 预览卡片 / 主题色点（纯展示） */
  swatch: string
  tokens: Record<string, string>
  /** 暗色覆盖（仅前台 / 预览消费；公众号固定浅色） */
  dark?: Record<string, string>
}

/** 全部 --t-* 键：应用主题时按此清单写 / 清，避免上一个主题的值残留 */
export const TYPO_TOKEN_KEYS = [
  '--t-font',
  '--t-font-size',
  '--t-line-height',
  '--t-paragraph-gap',
  '--t-heading-gap',
  '--t-text',
  '--t-heading',
  '--t-heading-weight',
  '--t-accent',
  '--t-link',
  '--t-quote-bg',
  '--t-quote-border',
  '--t-quote-text',
  '--t-code-bg',
  '--t-code-color',
  '--t-pre-bg',
  '--t-pre-color',
  '--t-img-radius',
  '--t-hr-style'
] as const

export const FOLLOW_THEME_ID = 't_follow'
/** 「跟随系统」找不到主题时的兜底：公众号端等价于旧 styleFor 的那套浅色 */
export const CLASSIC_THEME_ID = 't_classic'

/** 公众号基线（= 旧 styleFor 的取色），主题缺键时回落到这里 */
export const BASE_TOKENS: Record<string, string> = {
  '--t-font-size': '16px',
  '--t-line-height': '1.75',
  '--t-paragraph-gap': '1.2em',
  '--t-text': '#3f3f3f',
  '--t-heading': '#1f1f1f',
  '--t-accent': '#576b95',
  '--t-link': '#576b95',
  '--t-quote-bg': '#f8f8f8',
  '--t-quote-border': '#d9d9d9',
  '--t-quote-text': '#888',
  '--t-code-bg': '#f6f8fa',
  '--t-code-color': '#c7254e',
  '--t-pre-bg': '#f6f8fa',
  '--t-pre-color': '#333',
  '--t-img-radius': '4px',
  '--t-hr-style': 'line'
}

/** 暗色覆盖生成器：只调字色与「块底色」，背景仍由页面控制 */
function darkTokens(accent: string): Record<string, string> {
  return {
    '--t-text': '#cbd5e1',
    '--t-heading': '#f1f5f9',
    '--t-accent': accent,
    '--t-link': accent,
    '--t-quote-bg': 'rgba(255,255,255,0.04)',
    '--t-quote-border': accent,
    '--t-quote-text': '#94a3b8',
    '--t-code-bg': 'rgba(255,255,255,0.08)',
    '--t-code-color': accent,
    '--t-pre-bg': 'rgba(255,255,255,0.06)',
    '--t-pre-color': '#cbd5e1'
  }
}

interface ThemeSeed {
  id: string
  name: string
  desc: string
  group: TypoGroup
  swatch: string
  /** 暗色下的主色（缺省 = swatch；深色 swatch 需显式给亮色） */
  darkAccent?: string
  tokens: Record<string, string>
}

function buildTheme(seed: ThemeSeed): TypoTheme {
  const dark = seed.id === FOLLOW_THEME_ID ? undefined : darkTokens(seed.darkAccent ?? seed.swatch)
  return { id: seed.id, name: seed.name, desc: seed.desc, group: seed.group, swatch: seed.swatch, tokens: seed.tokens, dark }
}

export const TYPO_THEMES: TypoTheme[] = [
  buildTheme({
    id: FOLLOW_THEME_ID,
    name: '跟随系统',
    desc: '不注入任何变量，保持现状',
    group: 'simple',
    swatch: '#B4B2A9',
    tokens: {}
  }),
  buildTheme({
    id: CLASSIC_THEME_ID,
    name: '经典公众号',
    desc: '还原写死的那套浅色样式',
    group: 'wechat',
    swatch: '#576b95',
    tokens: { ...BASE_TOKENS }
  }),
  buildTheme({
    id: 't_teal',
    name: '青提',
    desc: '绿调标题 + 浅绿引用底',
    group: 'color',
    swatch: '#0F6E56',
    tokens: {
      '--t-text': '#243b34',
      '--t-heading': '#085041',
      '--t-accent': '#0F6E56',
      '--t-link': '#0F6E56',
      '--t-quote-bg': '#E1F5EE',
      '--t-quote-border': '#0F6E56',
      '--t-quote-text': '#0F6E56',
      '--t-code-bg': '#E1F5EE',
      '--t-code-color': '#085041',
      '--t-pre-bg': '#F1F7F4',
      '--t-pre-color': '#085041',
      '--t-img-radius': '8px'
    }
  }),
  buildTheme({
    id: 't_coral',
    name: '蜜橙',
    desc: '橙调、分割线圆点',
    group: 'color',
    swatch: '#993C1D',
    tokens: {
      '--t-text': '#4a352c',
      '--t-heading': '#712B13',
      '--t-accent': '#993C1D',
      '--t-link': '#993C1D',
      '--t-quote-bg': '#FAECE7',
      '--t-quote-border': '#F0997B',
      '--t-quote-text': '#712B13',
      '--t-code-bg': '#FAECE7',
      '--t-code-color': '#993C1D',
      '--t-pre-bg': '#FBF3EF',
      '--t-pre-color': '#712B13',
      '--t-img-radius': '8px',
      '--t-hr-style': 'dots'
    }
  }),
  buildTheme({
    id: 't_blue',
    name: '藏蓝',
    desc: '蓝调标题、引用左竖线',
    group: 'color',
    swatch: '#185FA5',
    tokens: {
      '--t-text': '#2b3a4a',
      '--t-heading': '#0C447C',
      '--t-accent': '#185FA5',
      '--t-link': '#185FA5',
      '--t-quote-bg': '#E6F1FB',
      '--t-quote-border': '#85B7EB',
      '--t-quote-text': '#0C447C',
      '--t-code-bg': '#E6F1FB',
      '--t-code-color': '#0C447C',
      '--t-pre-bg': '#F2F7FC',
      '--t-pre-color': '#0C447C',
      '--t-img-radius': '8px'
    }
  }),
  buildTheme({
    id: 't_pink',
    name: '粉笺',
    desc: '粉调、虚线分割线',
    group: 'color',
    swatch: '#993556',
    tokens: {
      '--t-text': '#4b2a37',
      '--t-heading': '#72243E',
      '--t-accent': '#993556',
      '--t-link': '#993556',
      '--t-quote-bg': '#FBEAF0',
      '--t-quote-border': '#ED93B1',
      '--t-quote-text': '#72243E',
      '--t-code-bg': '#FBEAF0',
      '--t-code-color': '#993556',
      '--t-pre-bg': '#FCF3F6',
      '--t-pre-color': '#72243E',
      '--t-img-radius': '8px',
      '--t-hr-style': 'dashed'
    }
  }),
  buildTheme({
    id: 't_purple',
    name: '紫烟',
    desc: '紫调标题与引用',
    group: 'color',
    swatch: '#534AB7',
    tokens: {
      '--t-text': '#332e52',
      '--t-heading': '#3C3489',
      '--t-accent': '#534AB7',
      '--t-link': '#534AB7',
      '--t-quote-bg': '#EEEDFE',
      '--t-quote-border': '#AFA9EC',
      '--t-quote-text': '#3C3489',
      '--t-code-bg': '#EEEDFE',
      '--t-code-color': '#3C3489',
      '--t-pre-bg': '#F6F5FE',
      '--t-pre-color': '#3C3489',
      '--t-img-radius': '8px'
    }
  }),
  buildTheme({
    id: 't_paper',
    name: '暖纸',
    desc: '暖灰字、米色代码块',
    group: 'color',
    swatch: '#854F0B',
    tokens: {
      '--t-text': '#3d3a37',
      '--t-heading': '#633806',
      '--t-accent': '#854F0B',
      '--t-link': '#854F0B',
      '--t-quote-bg': '#FAF6EE',
      '--t-quote-border': '#EF9F27',
      '--t-quote-text': '#633806',
      '--t-code-bg': '#F5EFE4',
      '--t-code-color': '#854F0B',
      '--t-pre-bg': '#F7F2E8',
      '--t-pre-color': '#633806',
      '--t-img-radius': '8px'
    }
  }),
  buildTheme({
    id: 't_ink',
    name: '墨纸',
    desc: '黑字白底、衬线标题',
    group: 'simple',
    swatch: '#1f1f1f',
    darkAccent: '#d3d1c7',
    tokens: {
      '--t-text': '#1f1f1f',
      '--t-heading': '#111111',
      '--t-accent': '#1f1f1f',
      '--t-link': '#1f1f1f',
      '--t-quote-bg': 'transparent',
      '--t-quote-border': '#999999',
      '--t-quote-text': '#555555',
      '--t-code-bg': '#f0f0ee',
      '--t-code-color': '#1f1f1f',
      '--t-pre-bg': '#f2f2f0',
      '--t-pre-color': '#1f1f1f',
      '--t-img-radius': '4px',
      '--t-font': 'Georgia,"Songti SC",SimSun,serif'
    }
  }),
  buildTheme({
    id: 't_large',
    name: '极简大字',
    desc: '17px / 行高 2.0，手机阅读友好',
    group: 'simple',
    swatch: '#444441',
    darkAccent: '#d3d1c7',
    tokens: {
      '--t-font-size': '17px',
      '--t-line-height': '2',
      '--t-paragraph-gap': '1.4em',
      '--t-text': '#444441',
      '--t-heading': '#2C2C2A',
      '--t-accent': '#444441',
      '--t-link': '#444441',
      '--t-quote-bg': 'transparent',
      '--t-quote-border': '#B4B2A9',
      '--t-quote-text': '#5F5E5A',
      '--t-code-bg': '#f0f0ee',
      '--t-code-color': '#444441',
      '--t-pre-bg': '#f2f2f0',
      '--t-pre-color': '#444441',
      '--t-img-radius': '4px',
      '--t-hr-style': 'dots'
    }
  })
]

const THEME_BY_ID = new Map(TYPO_THEMES.map(t => [t.id, t]))

function clampNum(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < min || n > max) return undefined
  return n
}

/**
 * 解析生效主题：单篇 → 全局默认 → 跟随系统。
 * 非法 / 不存在的 id 一律回落，绝不抛错（项目惯例：降级不抛错）。
 */
export function resolveTypo(typo?: BlogTypo | null, defaultId?: string): TypoTheme {
  const id = String(typo?.themeId ?? '').trim() || String(defaultId ?? '').trim()
  return THEME_BY_ID.get(id) ?? THEME_BY_ID.get(FOLLOW_THEME_ID)!
}

/**
 * 生成注入容器的 `--t-*` 样式对象。
 * 跟随系统 → 返回 {}（不写任何变量，CSS fallback 全部等于现值）；
 * 微调项（字号/行距/段距）覆盖主题值，越界或 NaN 一律丢弃。
 */
export function typoVars(
  typo?: BlogTypo | null,
  defaultId?: string,
  dark = false
): Record<string, string> {
  const theme = resolveTypo(typo, defaultId)
  if (theme.id === FOLLOW_THEME_ID) return {}
  const src = dark && theme.dark ? { ...theme.tokens, ...theme.dark } : theme.tokens
  const vars: Record<string, string> = {}
  for (const k of TYPO_TOKEN_KEYS) {
    const v = src[k]
    if (v) vars[k] = v
  }
  const fs = clampNum(typo?.fontSize, 14, 20)
  if (fs != null) vars['--t-font-size'] = `${fs}px`
  const lh = clampNum(typo?.lineHeight, 1.5, 2.2)
  if (lh != null) vars['--t-line-height'] = String(lh)
  const pg = clampNum(typo?.paragraphGap, 0.4, 2)
  if (pg != null) vars['--t-paragraph-gap'] = `${pg}em`
  return vars
}

/** 生效分割线样式；跟随系统返回空串（容器不打 data-hr 属性，走 CSS 现值） */
export function typoHrStyle(typo?: BlogTypo | null, defaultId?: string): '' | 'line' | 'dots' | 'dashed' {
  const theme = resolveTypo(typo, defaultId)
  if (theme.id === FOLLOW_THEME_ID) return ''
  const v = theme.tokens['--t-hr-style'] || BASE_TOKENS['--t-hr-style']
  return v === 'dots' || v === 'dashed' ? v : 'line'
}

function headingPx(tokenSize: string | undefined, ratio: number): string {
  const fs = Number.parseFloat(tokenSize || BASE_TOKENS['--t-font-size']) || 16
  return `${Math.round(ratio * fs)}px`
}

/**
 * 公众号端：tag → 内联 style。
 * classic 主题的输出与旧 styleFor() 逐字节一致（快照锚点）；主题只改取色来源，
 * 结构性规则（列表缩进、pre 折行、表格边框）保持原样不动。
 */
export function typoInlineStyle(
  tag: string,
  opts: { isCodeInPre?: boolean } = {},
  tokens: Record<string, string> = {}
): string {
  const tk = { ...BASE_TOKENS, ...tokens }
  const heading = tk['--t-heading']
  switch (tag) {
    case 'p':
      return `margin:${tk['--t-paragraph-gap']} 0;padding:0;`
    case 'h1':
      return `font-size:${headingPx(tk['--t-font-size'], 22 / 16)};font-weight:bold;margin:1.4em 0 0.8em;line-height:1.4;color:${heading};`
    case 'h2':
      return `font-size:${headingPx(tk['--t-font-size'], 20 / 16)};font-weight:bold;margin:1.4em 0 0.8em;line-height:1.4;color:${heading};`
    case 'h3':
      return `font-size:${headingPx(tk['--t-font-size'], 18 / 16)};font-weight:bold;margin:1.2em 0 0.6em;line-height:1.4;color:${heading};`
    case 'h4':
    case 'h5':
    case 'h6':
      return `font-size:${headingPx(tk['--t-font-size'], 1)};font-weight:bold;margin:1.1em 0 0.5em;color:${heading};`
    case 'img':
      return `max-width:100%;height:auto;display:block;margin:0.8em auto;border-radius:${tk['--t-img-radius']};`
    case 'a':
      return `color:${tk['--t-link']};text-decoration:none;word-break:break-all;`
    case 'strong':
    case 'b':
      return 'font-weight:bold;'
    case 'em':
    case 'i':
      return 'font-style:italic;'
    case 'code':
      if (opts.isCodeInPre) {
        return `background:none;padding:0;color:${tk['--t-pre-color']};font-family:Consolas,Menlo,monospace;font-size:14px;`
      }
      return `background-color:${tk['--t-code-bg']};color:${tk['--t-code-color']};padding:2px 6px;border-radius:3px;font-family:Consolas,Menlo,monospace;font-size:14px;word-break:break-all;`
    case 'pre':
      // 公众号会丢掉 overflow-x，长代码行会被直接裁掉 → 用 pre-wrap 自动折行（缩进仍保留）
      return `background-color:${tk['--t-pre-bg']};padding:12px 16px;border-radius:6px;margin:1em 0;font-size:13px;line-height:1.65;white-space:pre-wrap;word-wrap:break-word;word-break:break-all;tab-size:2;`
    case 'blockquote':
      return `margin:1em 0;padding:8px 12px;border-left:4px solid ${tk['--t-quote-border']};background-color:${tk['--t-quote-bg']};color:${tk['--t-quote-text']};`
    case 'ul':
    case 'ol':
      return 'padding-left:1.8em;margin:1em 0;'
    case 'li':
      return 'margin:0.4em 0;'
    case 'hr':
      return 'border:none;border-top:1px solid #eee;margin:1.5em 0;'
    case 'table':
      return 'border-collapse:collapse;width:100%;margin:1em 0;font-size:14px;'
    case 'th':
      return 'border:1px solid #e0e0e0;padding:6px 10px;text-align:left;background-color:#f6f8fa;font-weight:bold;'
    case 'td':
      return 'border:1px solid #e0e0e0;padding:6px 10px;text-align:left;'
    default:
      return ''
  }
}

/**
 * 公众号端分割线：不支持伪元素，dots 必须落成真实 DOM 节点。
 * 返回 null 表示「保持 <hr> 原样，交给 typoInlineStyle 处理」。
 */
export function hrMarkup(tokens: Record<string, string> = {}): string | null {
  const tk = { ...BASE_TOKENS, ...tokens }
  const style = tk['--t-hr-style']
  if (style === 'dots') {
    return `<section style="text-align:center;font-size:13px;letter-spacing:4px;color:${tk['--t-accent']};margin:1.5em 0;">●&nbsp;&nbsp;●&nbsp;&nbsp;●</section>`
  }
  if (style === 'dashed') {
    return '<section style="border-top:1px dashed #d9d9d9;margin:1.5em 0;"></section>'
  }
  return null
}
