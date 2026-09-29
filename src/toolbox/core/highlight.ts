/**
 * 搜索命中高亮（纯函数）
 *
 * 返回片段数组而非 HTML 字符串：模板按 hit 渲染 <mark>，避免 v-html 带来的注入风险。
 */

import type { HighlightPart } from '../types'
// 显式带 .ts 扩展名：既符合 ESM 规范，也保证可用 node --experimental-strip-types 直测
import { tokens } from './search.ts'

/** 正则元字符转义 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 把文本按关键字切成「命中 / 未命中」片段 */
export function splitHighlight(text: string, q: string): HighlightPart[] {
  const src = text || ''
  const ts = tokens(q)
  if (!ts.length) return [{ text: src, hit: false }]

  const pat = ts.map(escapeRegExp).join('|')
  const re = new RegExp('(' + pat + ')', 'gi')
  const parts: HighlightPart[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index), hit: false })
    parts.push({ text: m[0], hit: true })
    last = m.index + m[0].length
    if (m[0] === '') re.lastIndex++ // 防空匹配死循环
  }
  if (last < src.length) parts.push({ text: src.slice(last), hit: false })
  return parts.length ? parts : [{ text: src, hit: false }]
}
