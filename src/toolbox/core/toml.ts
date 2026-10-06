/**
 * TOML 解析与序列化（子集实现，零依赖）
 * 支持：键值对、整数/浮点/布尔/字符串/日期、数组（含跨行）、[table]、[[array of table]]、# 注释
 * 不支持：内联表 {a=1}、多行字符串 """ （解析为普通字符串时按 basic 处理）
 */

export type TomlValue = string | number | boolean | TomlValue[] | { [k: string]: TomlValue }

/** 去掉字符串外的注释 */
function stripComment(line: string): string {
  let inStr = false
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === quote) inStr = false
    } else if (c === '"' || c === "'") {
      inStr = true
      quote = c
    } else if (c === '#') {
      return line.slice(0, i)
    }
  }
  return line
}

function parseScalar(raw: string): TomlValue {
  const s = raw.trim()
  if (!s) return ''
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"')
  }
  if (s === 'true') return true
  if (s === 'false') return false
  if (s.startsWith('[')) {
    const inner = s.slice(1, -1).trim()
    if (!inner) return []
    return splitTopLevel(inner).map(x => parseScalar(x))
  }
  if (/^[+-]?\d+$/.test(s)) return Number(s)
  if (/^[+-]?\d+\.\d+$/.test(s) || /^[+-]?\d+[eE][+-]?\d+$/.test(s)) return Number(s)
  return s
}

/** 按顶层逗号切分（忽略引号与嵌套括号） */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let inStr = false
  let quote = ''
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      cur += c
      if (c === '\\') {
        cur += s[i + 1] ?? ''
        i++
      } else if (c === quote) inStr = false
      continue
    }
    if (c === '"' || c === "'") {
      inStr = true
      quote = c
      cur += c
      continue
    }
    if (c === '[' || c === '{') depth++
    if (c === ']' || c === '}') depth--
    if (c === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** 拆分 key（支持 a.b.c 与引号键） */
function splitKey(key: string): string[] {
  const parts: string[] = []
  let cur = ''
  let inStr = false
  let quote = ''
  for (const c of key.trim()) {
    if (inStr) {
      cur += c
      if (c === quote) inStr = false
      continue
    }
    if (c === '"' || c === "'") {
      inStr = true
      quote = c
      continue
    }
    if (c === '.') {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(Boolean)
}

function ensurePath(root: Record<string, TomlValue>, parts: string[]): Record<string, TomlValue> {
  let cur = root
  for (const p of parts) {
    if (cur[p] === undefined || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      cur[p] = {} as Record<string, TomlValue>
    }
    cur = cur[p] as Record<string, TomlValue>
  }
  return cur
}

function ensureArrayPath(root: Record<string, TomlValue>, parts: string[]): Record<string, TomlValue> {
  let cur = root
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const last = i === parts.length - 1
    if (last) {
      if (!Array.isArray(cur[p])) cur[p] = [] as TomlValue[]
      const arr = cur[p] as TomlValue[]
      const next = {} as Record<string, TomlValue>
      arr.push(next)
      return next
    }
    if (cur[p] === undefined || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      cur[p] = {} as Record<string, TomlValue>
    }
    cur = cur[p] as Record<string, TomlValue>
  }
  return cur
}

/** 解析 TOML → 对象 */
export function parseToml(input: string): Record<string, TomlValue> {
  const root: Record<string, TomlValue> = {}
  const lines = (input || '').split(/\r?\n/)
  let current: Record<string, TomlValue> = root
  let buffer: string | null = null
  let pendingKey: string[] | null = null

  const flush = () => {
    if (buffer !== null && pendingKey) {
      const parts = pendingKey
      const parent = parts.length > 1 ? ensurePath(root, parts.slice(0, -1)) : current
      parent[parts[parts.length - 1]] = parseScalar(buffer)
    }
    buffer = null
    pendingKey = null
  }

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim()
    if (!line) {
      if (buffer !== null) continue
      continue
    }
    if (line.startsWith('[')) {
      flush()
      const arr = line.startsWith('[[')
      const name = line.replace(/^\[\[?/, '').replace(/\]\]?$/, '').trim()
      current = arr ? ensureArrayPath(root, splitKey(name)) : ensurePath(root, splitKey(name))
      continue
    }
    const eq = line.indexOf('=')
    if (eq > 0) {
      flush()
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      // 跨行数组
      const open = (value.match(/\[/g) || []).length
      const close = (value.match(/\]/g) || []).length
      if (open > close) {
        pendingKey = splitKey(key)
        buffer = value
        continue
      }
      const parts = splitKey(key)
      const parent = parts.length > 1 ? ensurePath(root, parts.slice(0, -1)) : current
      parent[parts[parts.length - 1]] = parseScalar(value)
    } else if (buffer !== null) {
      buffer += line
      if ((buffer.match(/\]/g) || []).length >= (buffer.match(/\[/g) || []).length) flush()
    }
  }
  flush()
  return root
}

function fmtScalar(v: TomlValue): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0'
  if (Array.isArray(v)) return '[' + v.map(fmtScalar).join(', ') + ']'
  if (v && typeof v === 'object') return '' // 交由 table 输出
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
}

/** 对象 → TOML（先标量后表，表按路径展开） */
export function stringifyToml(obj: Record<string, unknown>, prefix = ''): string {
  const lines: string[] = []
  const tables: string[] = []
  const entries = Object.entries(obj || {})
  for (const [k, v] of entries) {
    if (v && typeof v === 'object' && !Array.isArray(v)) continue
    lines.push(`${k} = ${fmtScalar(v as TomlValue)}`)
  }
  for (const [k, v] of entries) {
    if (Array.isArray(v)) {
      const objs = v.filter(x => x && typeof x === 'object')
      if (objs.length && objs.length === v.length) {
        objs.forEach(item => {
          tables.push(`[[${prefix}${k}]]\n` + stringifyToml(item as Record<string, unknown>))
        })
        continue
      }
      continue
    }
    if (v && typeof v === 'object') {
      tables.push(`[${prefix}${k}]\n` + stringifyToml(v as Record<string, unknown>))
    }
  }
  return [...(lines.length ? [lines.join('\n')] : []), ...tables].join('\n\n').trim()
}

/** 自动检测配置格式 */
export function detectFormat(text: string): 'json' | 'yaml' | 'toml' {
  const s = (text || '').trim()
  if (!s) return 'json'
  if (s.startsWith('{') || s.startsWith('[')) return 'json'
  // TOML：key = value 或 [table] 表头
  if (/^\s*[\w."'-]+\s*=/.test(s)) return 'toml'
  if (/^\s*\[\s*[a-zA-Z_"'.[\]]/.test(s)) return 'toml'
  if (/^\s*[\w.-]+\s*:/m.test(s)) return 'yaml'
  return 'json'
}
