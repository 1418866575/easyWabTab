/**
 * JSON 处理纯函数（零 Vue 依赖，可 node 直测）
 * 覆盖：格式化 / 压缩 / 键排序 / 语法错误定位（行+列）/ 树形结构 / 高亮片段化
 */

import type { HighlightPart } from '../types.ts'

/** 语法错误位置 */
export interface JsonError {
  message: string
  position: number
  line: number
  column: number
}

export interface JsonResult {
  ok: boolean
  text: string
  error?: JsonError
  /** 解析成功时的对象（压缩/格式化共用） */
  value?: unknown
}

export type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'plain'

export interface JsonToken extends HighlightPart {
  type: JsonTokenType
}

const INDENT_MAP: Record<string, string | number> = {
  '2': '  ',
  '4': '    ',
  tab: '\t'
}

/** 按位置换算行列（position 为字符下标） */
export function positionToLineCol(text: string, position: number): { line: number; column: number } {
  if (position < 0) return { line: -1, column: -1 }
  const before = text.slice(0, position)
  const lines = before.split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}

/** 从 SyntaxError 提取 position（兼容不同引擎文案） */
export function extractErrorPosition(message: string): number {
  const m = /position\s+(\d+)/.exec(message || '')
  return m ? Number(m[1]) : -1
}

/** 递归排序键名 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    Object.keys(src)
      .sort()
      .forEach(k => {
        out[k] = sortKeysDeep(src[k])
      })
    return out
  }
  return value
}

/**
 * 格式化 / 压缩 / 校验 JSON
 * @param input 原始文本
 * @param opts.indent 2|4|tab；opts.sortKeys 键排序；opts.compress 压缩为单行
 */
export function formatJson(
  input: string,
  opts: { indent?: string; sortKeys?: boolean; compress?: boolean } = {}
): JsonResult {
  const raw = input ?? ''
  if (!raw.trim()) {
    return { ok: false, text: '', error: { message: '请输入 JSON 内容', position: -1, line: -1, column: -1 } }
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (e) {
    const message = (e as Error).message || 'JSON 解析失败'
    const position = extractErrorPosition(message)
    const { line, column } = positionToLineCol(raw, position)
    return { ok: false, text: '', error: { message, position, line, column } }
  }
  const target = opts.sortKeys ? sortKeysDeep(value) : value
  const indent = opts.compress ? undefined : INDENT_MAP[opts.indent || '2'] ?? '  '
  const text = opts.compress ? JSON.stringify(target) : JSON.stringify(target, null, indent)
  return { ok: true, text: text ?? '', value: target }
}

/** 树形节点（供折叠浏览） */
export interface JsonTreeNode {
  key: string
  path: string
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  /** 叶子节点的展示值 */
  preview: string
  count?: number
  children?: JsonTreeNode[]
}

function typeOf(v: unknown): JsonTreeNode['type'] {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  return 'string'
}

function previewOf(v: unknown, type: JsonTreeNode['type']): string {
  if (type === 'string') return JSON.stringify(v)
  if (type === 'null') return 'null'
  return String(v)
}

/** JSON 值 → 树形结构（path 为 JSONPath，如 $.a.b[0]） */
export function jsonToTree(value: unknown, key = 'root', path = '$'): JsonTreeNode {
  const type = typeOf(value)
  const node: JsonTreeNode = { key, path, type, preview: type === 'object' || type === 'array' ? '' : previewOf(value, type) }
  if (type === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    node.count = keys.length
    node.children = keys.map(k => jsonToTree(obj[k], k, `${path}.${k}`))
  } else if (type === 'array') {
    const arr = value as unknown[]
    node.count = arr.length
    node.children = arr.map((item, i) => jsonToTree(item, String(i), `${path}[${i}]`))
  }
  return node
}

/** JSON 文本 → 高亮片段数组（模板渲染用，禁止 v-html） */
export function tokenizeJson(text: string): JsonToken[] {
  const out: JsonToken[] = []
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}\[\],])|(\s+)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false, type: 'plain' })
    const [full, str, colon, num, bool, nul, punct, space] = m
    if (str) {
      out.push({ text: str, hit: false, type: colon ? 'key' : 'string' })
      if (colon) out.push({ text: colon, hit: false, type: 'punct' })
    } else if (num) out.push({ text: num, hit: false, type: 'number' })
    else if (bool) out.push({ text: bool, hit: false, type: 'boolean' })
    else if (nul) out.push({ text: nul, hit: false, type: 'null' })
    else if (punct) out.push({ text: punct, hit: false, type: 'punct' })
    else out.push({ text: space ?? full, hit: false, type: 'plain' })
    last = m.index + full.length
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false, type: 'plain' })
  return out
}

/** 统计：字符数 / 行数 / 节点数 */
export function jsonStats(text: string, value?: unknown): { chars: number; lines: number; nodes: number; depth: number } {
  const depth = value === undefined ? 0 : depthOf(value)
  return {
    chars: text.length,
    lines: text ? text.split('\n').length : 0,
    nodes: value === undefined ? 0 : countNodes(value),
    depth
  }
}

function depthOf(v: unknown, d = 1): number {
  if (v && typeof v === 'object') {
    const vals = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)
    if (!vals.length) return d
    return Math.max(...vals.map(x => depthOf(x, d + 1)))
  }
  return d
}

function countNodes(v: unknown): number {
  if (v && typeof v === 'object') {
    const vals = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)
    return 1 + vals.reduce((s, x) => s + countNodes(x), 0)
  }
  return 1
}
