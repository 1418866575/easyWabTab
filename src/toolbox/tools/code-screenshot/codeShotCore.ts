/**
 * 代码美化截图纯逻辑：自研轻量分词高亮（不引入 highlight.js）+ SVG foreignObject 转 PNG
 */

export type LangId = 'javascript' | 'typescript' | 'html' | 'css' | 'json' | 'python' | 'java' | 'go'

export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'punct'

export interface Token {
  text: string
  kind: TokenKind
}

export const LANGS: { id: LangId; name: string }[] = [
  { id: 'javascript', name: 'JavaScript' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'html', name: 'HTML' },
  { id: 'css', name: 'CSS' },
  { id: 'json', name: 'JSON' },
  { id: 'python', name: 'Python' },
  { id: 'java', name: 'Java' },
  { id: 'go', name: 'Go' }
]

const JS_KEYWORDS =
  'const let var function return if else for while do break continue new class extends super this typeof instanceof in of try catch finally throw switch case default async await yield import export from as null undefined true false void delete static get set'
const TS_KEYWORDS = JS_KEYWORDS + ' interface type enum implements readonly public private protected declare namespace keyof infer never unknown any'
const PY_KEYWORDS =
  'def class return if elif else for while break continue import from as pass raise try except finally with lambda global nonlocal yield async await and or not is in None True False self assert del'
const GO_KEYWORDS =
  'package import func var const type struct interface map chan go defer if else for range switch case default break continue return select fallthrough nil true false make new append len cap delete panic recover'
const JAVA_KEYWORDS =
  'public private protected class interface extends implements static final void int long double float boolean char String new return if else for while do switch case break continue try catch finally throw throws import package this super null true false abstract enum'
const CSS_KEYWORDS = 'important media supports keyframes import charset'
const JSON_KEYWORDS = 'true false null'

const KEYWORDS: Record<LangId, string[]> = {
  javascript: JS_KEYWORDS.split(' '),
  typescript: TS_KEYWORDS.split(' '),
  html: ['html', 'head', 'body', 'div', 'span', 'script', 'style', 'a', 'p', 'ul', 'li', 'table', 'img'],
  css: CSS_KEYWORDS.split(' '),
  json: JSON_KEYWORDS.split(' '),
  python: PY_KEYWORDS.split(' '),
  java: JAVA_KEYWORDS.split(' '),
  go: GO_KEYWORDS.split(' ')
}

/** 注释起始符（按优先级排列，取最先命中的） */
const COMMENT_RULES: Record<LangId, RegExp> = {
  javascript: /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  typescript: /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  html: /^(<!--[\s\S]*?-->)/,
  css: /^(\/\*[\s\S]*?\*\/)/,
  json: /^(\/\/[^\n]*)/,
  python: /^(#[^\n]*)/,
  java: /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  go: /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/
}

const STRING_RE = /^("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/
const NUMBER_RE = /^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i
const WORD_RE = /^[A-Za-z_$@#][\w$-]*/

export function highlight(code: string, lang: LangId): Token[] {
  const src = typeof code === 'string' ? code.slice(0, 500) : ''
  if (!src) return []
  const kw = new Set(KEYWORDS[lang])
  const comment = COMMENT_RULES[lang]
  const out: Token[] = []
  let rest = src
  let guard = 0

  while (rest.length && guard++ < 20000) {
    if (lang === 'html') {
      const tag = /^<\/?[a-zA-Z][\w-]*/.exec(rest)
      if (tag) {
        out.push({ text: tag[0], kind: 'keyword' })
        rest = rest.slice(tag[0].length)
        continue
      }
    }
    const cm = comment.exec(rest)
    if (cm) {
      out.push({ text: cm[0], kind: 'comment' })
      rest = rest.slice(cm[0].length)
      continue
    }
    const str = STRING_RE.exec(rest)
    if (str && str[0]) {
      out.push({ text: str[0], kind: 'string' })
      rest = rest.slice(str[0].length)
      continue
    }
    const num = NUMBER_RE.exec(rest)
    if (num) {
      out.push({ text: num[0], kind: 'number' })
      rest = rest.slice(num[0].length)
      continue
    }
    const word = WORD_RE.exec(rest)
    if (word) {
      const w = word[0]
      const bare = w.replace(/^[@#$]/, '')
      let kind: TokenKind = 'plain'
      if (kw.has(bare) || kw.has(w)) kind = 'keyword'
      else if (/^[A-Z]/.test(bare)) kind = 'type'
      out.push({ text: w, kind })
      rest = rest.slice(w.length)
      continue
    }
    const ch = rest[0]
    out.push({ text: ch, kind: /\s/.test(ch) ? 'plain' : 'punct' })
    rest = rest.slice(1)
  }
  return out
}

export interface CardTheme {
  id: 'dark' | 'light'
  name: string
  bg: string
  fg: string
  bar: string
  codeBg: string
  keyword: string
  string: string
  comment: string
  number: string
  type: string
  punct: string
}

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'dark', name: '暗色',
    bg: '#1e2233', fg: '#e6e8f0', bar: '#171b28', codeBg: '#141824',
    keyword: '#c792ea', string: '#8ee6a0', comment: '#5c6478', number: '#f2b56b', type: '#7fd1e8', punct: '#9aa3b8'
  },
  {
    id: 'light', name: '亮色',
    bg: '#ffffff', fg: '#24292f', bar: '#f0f2f5', codeBg: '#f6f8fa',
    keyword: '#a626a4', string: '#2f9e44', comment: '#9aa0a6', number: '#c26a00', type: '#0b7285', punct: '#6b7280'
  }
]

const KIND_KEY: Record<Exclude<TokenKind, 'plain'>, keyof CardTheme> = {
  keyword: 'keyword', string: 'string', comment: 'comment', number: 'number', type: 'type', punct: 'punct'
}

/** 生成带内联样式的卡片 HTML（foreignObject 截图要求全部内联） */
export function renderCard(
  tokens: Token[],
  opts: { theme: CardTheme; title: string; lang: string; lineNumbers: boolean; width: number }
): { html: string; height: number } {
  const t = opts.theme
  const lines: Token[][] = [[]]
  for (const tk of tokens) {
    const parts = tk.text.split('\n')
    parts.forEach((p, i) => {
      if (i > 0) lines.push([])
      if (p) lines[lines.length - 1].push({ text: p, kind: tk.kind })
    })
  }
  const pad = 20
  const lineH = 21
  const barH = 40
  const height = barH + pad * 2 + lines.length * lineH
  const color = (k: TokenKind) => (k === 'plain' ? t.fg : t[KIND_KEY[k]])

  const lineHtml = lines
    .map((tokens, i) => {
      const num = opts.lineNumbers ? `<span style="color:${t.comment};display:inline-block;width:34px;text-align:right;margin-right:14px;user-select:none">${i + 1}</span>` : ''
      const body = tokens
        .map((tk) => {
          const escaped = tk.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          return tk.kind === 'plain' ? escaped : `<span style="color:${color(tk.kind)}">${escaped}</span>`
        })
        .join('')
      return `<div style="height:${lineH}px;line-height:${lineH}px;white-space:pre">${num}${body || ' '}</div>`
    })
    .join('')

  const html = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${opts.width}px;background:${t.bg};border-radius:10px;overflow:hidden;font-family:Consolas,Menlo,monospace;box-shadow:0 8px 24px rgba(0,0,0,.18)">
  <div style="height:${barH}px;background:${t.bar};display:flex;align-items:center;padding:0 14px;gap:8px">
    <span style="width:11px;height:11px;border-radius:50%;background:#ff5f57"></span>
    <span style="width:11px;height:11px;border-radius:50%;background:#febc2e"></span>
    <span style="width:11px;height:11px;border-radius:50%;background:#28c840"></span>
    <span style="color:${t.fg};font-size:12px;margin-left:8px;font-family:system-ui,sans-serif">${escapeHtml(opts.title)}</span>
    <span style="color:${t.comment};font-size:11px;margin-left:auto;font-family:system-ui,sans-serif">${escapeHtml(opts.lang)}</span>
  </div>
  <div style="padding:${pad}px;background:${t.codeBg};color:${t.fg};font-size:13px">${lineHtml}</div>
</div>`
  return { html, height }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 卡片 HTML → PNG Blob（SVG foreignObject 管线，2x 缩放） */
export async function htmlToPng(innerHtml: string, width: number, height: number, scale = 2): Promise<Blob> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;transform:scale(${scale});transform-origin:top left">${innerHtml}</div>
  </foreignObject>
</svg>`
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('渲染失败'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('导出失败')
  return blob
}
