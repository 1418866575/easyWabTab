/**
 * 公众号排版纯逻辑：Markdown → 内联样式 HTML（公众号编辑器会剥离 <style>，必须内联）
 */

export interface ThemeTokens {
  id: string
  name: string
  /** 主色（标题 / 强调 / 边框） */
  primary: string
  /** 正文色 */
  text: string
  /** 次要文字 */
  muted: string
  /** 引用块背景 */
  quoteBg: string
  /** 代码块背景 */
  codeBg: string
}

export const THEMES: ThemeTokens[] = [
  { id: 'wechat', name: '微信经典', primary: '#1aad19', text: '#333333', muted: '#888888', quoteBg: '#f7f7f7', codeBg: '#f2f2f2' },
  { id: 'clean', name: '简约白', primary: '#333333', text: '#3f3f3f', muted: '#9a9a9a', quoteBg: '#fafafa', codeBg: '#f4f4f4' },
  { id: 'orange', name: '暖橙', primary: '#e6752c', text: '#3d3d3d', muted: '#a08a76', quoteBg: '#fdf3ea', codeBg: '#f7ede2' },
  { id: 'green', name: '青绿', primary: '#2c9e8f', text: '#2f3b38', muted: '#8fa5a0', quoteBg: '#edf7f5', codeBg: '#e5f2ef' },
  { id: 'blue', name: '商务蓝', primary: '#2f6fed', text: '#333a45', muted: '#8b95a5', quoteBg: '#eef3fd', codeBg: '#e8eefb' },
  { id: 'violet', name: '紫罗兰', primary: '#7b5cd6', text: '#3a3547', muted: '#9c95ad', quoteBg: '#f4f0fd', codeBg: '#ece6fa' }
]

/** 标题左侧装饰条宽度（部分主题用） */
export function themeById(id: string): ThemeTokens {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

type StyleMap = Record<string, string>

function buildStyles(t: ThemeTokens): Record<string, StyleMap> {
  const base: StyleMap = { 'font-size': '15px', color: t.text, 'line-height': '1.8', 'letter-spacing': '0.5px' }
  return {
    h1: { ...base, 'font-size': '20px', 'font-weight': '700', margin: '28px 0 16px', 'border-left': `4px solid ${t.primary}`, 'padding-left': '10px' },
    h2: { ...base, 'font-size': '18px', 'font-weight': '700', margin: '24px 0 14px', color: t.primary },
    h3: { ...base, 'font-size': '16px', 'font-weight': '600', margin: '20px 0 12px' },
    p: { ...base, margin: '0 0 16px' },
    blockquote: {
      ...base,
      margin: '0 0 16px',
      padding: '10px 14px',
      background: t.quoteBg,
      'border-left': `3px solid ${t.primary}`,
      color: t.muted,
      'font-size': '14px'
    },
    ul: { ...base, margin: '0 0 16px', 'padding-left': '22px' },
    ol: { ...base, margin: '0 0 16px', 'padding-left': '22px' },
    li: { ...base, margin: '0 0 6px' },
    strong: { ...base, color: t.primary, 'font-weight': '700' },
    em: { ...base, 'font-style': 'italic' },
    a: { ...base, color: t.primary, 'text-decoration': 'none', 'border-bottom': `1px solid ${t.primary}` },
    hr: { margin: '24px 0', border: 'none', 'border-top': `1px dashed ${t.primary}` },
    code: {
      'font-family': 'Consolas, Monaco, monospace',
      'font-size': '13px',
      color: t.primary,
      background: t.codeBg,
      padding: '2px 5px',
      'border-radius': '3px'
    },
    pre: {
      'font-family': 'Consolas, Monaco, monospace',
      'font-size': '13px',
      background: t.codeBg,
      padding: '12px',
      'border-radius': '4px',
      overflow: 'auto',
      'white-space': 'pre-wrap'
    },
    table: { ...base, 'border-collapse': 'collapse', width: '100%', margin: '0 0 16px' },
    th: { ...base, border: `1px solid ${t.primary}`, padding: '6px 10px', background: t.quoteBg },
    td: { ...base, border: `1px solid ${t.primary}`, padding: '6px 10px' },
    img: { 'max-width': '100%', display: 'block', margin: '0 auto 16px', 'border-radius': '4px' }
  }
}

function styleAttr(style: StyleMap): string {
  return Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}

/** 主题 → 内联样式 HTML（供预览与复制共用，剪贴板直接可用） */
export function applyInlineStyles(html: string, themeId: string): string {
  const t = themeById(themeId)
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return html
  const styles = buildStyles(t)
  for (const [tag, style] of Object.entries(styles)) {
    for (const el of root.querySelectorAll(tag)) el.setAttribute('style', styleAttr(style))
  }
  return root.innerHTML
}

/** 一次性产出：渲染 Markdown 再按主题内联 */
export function renderWithTheme(md: string, themeId: string, render: (src: string) => string): string {
  return applyInlineStyles(render(md ?? ''), themeId)
}

export const DRAFT_KEY = 'toolbox:typeset:draft'
/** 草稿保留 30 天 */
export const DRAFT_TTL = 30 * 86400000

export interface TypesetDraft {
  md: string
  themeId: string
  ts: number
}

export function normalizeDraft(raw: unknown): TypesetDraft | null {
  const d = raw as Partial<TypesetDraft> | null
  if (!d || typeof d.md !== 'string' || typeof d.themeId !== 'string' || typeof d.ts !== 'number') return null
  if (Date.now() - d.ts > DRAFT_TTL) return null
  return { md: d.md, themeId: d.themeId, ts: d.ts }
}
