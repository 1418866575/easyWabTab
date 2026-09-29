/**
 * JSON → XML / Excel 相关纯函数
 * - XML：递归生成，数组元素用 <item> 包裹，可选缩进
 * - Excel：由组件层用 xlsx 生成（此处提供表头抽取与展平，便于预览）
 */

export interface XmlOptions {
  rootName?: string
  arrayItemName?: string
  pretty?: boolean
  indent?: string
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function validTag(name: string): string {
  const cleaned = String(name).replace(/[^a-zA-Z0-9_\-.:]/g, '_')
  return /^[a-zA-Z_:]/.test(cleaned) ? cleaned : `f_${cleaned}`
}

function toXml(value: unknown, name: string, opts: Required<XmlOptions>, level: number): string {
  const pad = opts.pretty ? '\n' + opts.indent.repeat(level) : ''
  const padEnd = opts.pretty ? '\n' + opts.indent.repeat(Math.max(level - 1, 0)) : ''
  const tag = validTag(name)
  if (value === null || value === undefined) return `${pad}<${tag} />`
  if (Array.isArray(value)) {
    const inner = value.map(v => toXml(v, opts.arrayItemName, opts, level + 1)).join('')
    return `${pad}<${tag}>${inner}${padEnd}</${tag}>`
  }
  if (typeof value === 'object') {
    const inner = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => toXml(v, k, opts, level + 1))
      .join('')
    return `${pad}<${tag}>${inner}${padEnd}</${tag}>`
  }
  if (typeof value === 'boolean') return `${pad}<${tag}>${value ? 'true' : 'false'}</${tag}>`
  if (typeof value === 'number') return `${pad}<${tag}>${value}</${tag}>`
  return `${pad}<${tag}>${escapeXml(String(value))}</${tag}>`
}

/** JSON 文本 → XML 文本 */
export function jsonToXml(input: string, opts: XmlOptions = {}): { ok: boolean; text: string; error?: string } {
  try {
    const value = JSON.parse(input)
    const o: Required<XmlOptions> = {
      rootName: opts.rootName || 'root',
      arrayItemName: opts.arrayItemName || 'item',
      pretty: opts.pretty !== false,
      indent: opts.indent || '  '
    }
    const nl = o.pretty ? '\n' : ''
    let body: string
    if (Array.isArray(value)) {
      body = value.map(v => toXml(v, o.arrayItemName, o, 1)).join('')
      return { ok: true, text: `<?xml version="1.0" encoding="UTF-8"?>${nl}<${validTag(o.rootName)}>${body}${nl}</${validTag(o.rootName)}>` }
    }
    if (value && typeof value === 'object') {
      body = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => toXml(v, k, o, 1))
        .join('')
      return { ok: true, text: `<?xml version="1.0" encoding="UTF-8"?>${nl}<${validTag(o.rootName)}>${body}${nl}</${validTag(o.rootName)}>` }
    }
    return { ok: false, text: '', error: '根节点必须是对象或数组' }
  } catch (e) {
    return { ok: false, text: '', error: (e as Error).message }
  }
}

/** 从对象数组抽取表头（键并集，保持首次出现顺序） */
export function collectHeaders(rows: Record<string, unknown>[]): string[] {
  const set: string[] = []
  rows.forEach(r => {
    Object.keys(r || {}).forEach(k => {
      if (!set.includes(k)) set.push(k)
    })
  })
  return set
}

/**
 * 展平为表格行：嵌套对象按 a.b 展开（最多 4 层），数组序列化为 JSON 字符串
 */
export function flattenRows(rows: unknown[]): Record<string, unknown>[] {
  return (rows || []).map(r => {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      const out: Record<string, unknown> = {}
      const walk = (obj: Record<string, unknown>, prefix: string, depth: number) => {
        Object.entries(obj).forEach(([k, v]) => {
          const key = prefix ? `${prefix}.${k}` : k
          if (v && typeof v === 'object' && !Array.isArray(v) && depth < 4) {
            walk(v as Record<string, unknown>, key, depth + 1)
          } else if (Array.isArray(v)) {
            out[key] = JSON.stringify(v)
          } else {
            out[key] = v
          }
        })
      }
      walk(r as Record<string, unknown>, '', 1)
      return out
    }
    return { value: r }
  })
}

/** 将 JSON 转为可用于 Excel 导出的二维数组（含表头） */
export function jsonToSheetData(input: string): { ok: boolean; rows: unknown[][]; error?: string } {
  try {
    const value = JSON.parse(input)
    const arr = Array.isArray(value) ? value : [value]
    const flat = flattenRows(arr as unknown[])
    const headers = collectHeaders(flat)
    const rows = [headers, ...flat.map(r => headers.map(h => r[h] ?? ''))]
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, rows: [], error: (e as Error).message }
  }
}
