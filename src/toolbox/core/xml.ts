/**
 * XML 相关纯函数（零 Vue 依赖，可 node 直测）
 * - 格式化：解析 XML 文本，按层级缩进/换行，校验结构并定位错误（行+列）
 * - 生成：JSON → XML 递归生成，数组元素用 <item> 包裹，可选缩进
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

// =============================================================================
// XML 文本格式化 / 校验
// =============================================================================

/** XML 语法错误位置（与 JSON 侧结构保持一致） */
export interface XmlError {
  message: string
  position: number
  line: number
  column: number
}

export interface XmlFormatResult {
  ok: boolean
  text: string
  error?: XmlError
}

export interface XmlFormatOptions {
  /** 缩进：'2' | '4' | 'tab'，或直接传缩进字符串；缺省 2 空格 */
  indent?: string
}

/** 解析后的节点：element 可含子节点；其余为原样保留的文本类节点 */
interface XmlElementNode {
  kind: 'element'
  name: string
  attrs: string
  selfClose: boolean
  children: XmlNode[]
  pos: number
}
interface XmlRawNode {
  kind: 'text' | 'comment' | 'cdata' | 'pi' | 'doctype'
  raw: string
  pos: number
}
type XmlNode = XmlElementNode | XmlRawNode

const XML_INDENT_MAP: Record<string, string> = {
  '2': '  ',
  '4': '    ',
  tab: '\t'
}

class XmlParseError extends Error {
  info: XmlError
  constructor(info: XmlError) {
    super(info.message)
    this.name = 'XmlParseError'
    this.info = info
  }
}

/** 字符下标 → 行/列（1 基） */
function xmlLineCol(text: string, pos: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(pos, text.length))
  const before = text.slice(0, clamped)
  const lines = before.split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}

/**
 * 解析 XML 文本为节点树（同时完成结构校验）
 * - 校验标签配对、单一根元素、属性必须带引号等
 * - 注释 / CDATA / 处理指令 / DOCTYPE 原样保留
 */
function parseXml(input: string): XmlNode[] {
  const s = input
  const n = s.length
  let i = 0
  const roots: XmlNode[] = []
  const stack: XmlElementNode[] = []

  const makeError = (message: string, pos: number): never => {
    const lc = xmlLineCol(s, pos)
    throw new XmlParseError({ message, position: pos, line: lc.line, column: lc.column })
  }

  const append = (node: XmlNode) => {
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  /** 名称合法性（宽松：只要不含空白与 XML 结构分隔符即可，允许 Unicode 与命名空间前缀） */
  const nameBad = (name: string) => !name || /[\s<>/="'!?]/.test(name)

  function parseOpenTag(start: number): { name: string; attrs: string; selfClose: boolean; end: number } {
    let nameEnd = start + 1
    while (nameEnd < n && !/[\s/>]/.test(s[nameEnd])) nameEnd++
    const name = s.slice(start + 1, nameEnd)
    if (!name) makeError('开始标签缺少名称', start)
    if (nameBad(name)) makeError(`标签名称不合法：${name}`, start)

    let k = nameEnd
    while (k < n) {
      while (k < n && /\s/.test(s[k])) k++
      if (k >= n) makeError(`标签 <${name}> 未闭合（缺少 >）`, start)
      if (s[k] === '>') {
        return { name, attrs: s.slice(nameEnd, k).trim(), selfClose: false, end: k + 1 }
      }
      if (s[k] === '/') {
        if (s[k + 1] === '>') {
          return { name, attrs: s.slice(nameEnd, k).trim(), selfClose: true, end: k + 2 }
        }
        makeError(`标签 <${name}> 中 "/" 之后应为 ">"`, k)
      }
      // 属性名
      const aStart = k
      while (k < n && !/[\s=/>]/.test(s[k])) k++
      const aName = s.slice(aStart, k)
      if (!aName) makeError(`标签 <${name}> 的属性解析失败`, k)
      if (nameBad(aName)) makeError(`属性名不合法：${aName}`, aStart)
      while (k < n && /\s/.test(s[k])) k++
      if (s[k] !== '=') makeError(`属性 ${aName} 缺少 "=" 或值未加引号`, k)
      k++
      while (k < n && /\s/.test(s[k])) k++
      const quote = s[k]
      if (quote !== '"' && quote !== "'") makeError(`属性 ${aName} 的值必须用引号包裹`, k)
      k++
      const vStart = k
      while (k < n && s[k] !== quote) k++
      if (k >= n) makeError(`属性 ${aName} 的引号未闭合`, vStart)
      k++
    }
    return makeError(`标签 <${name}> 未闭合（缺少 >）`, start)
  }

  while (i < n) {
    if (s[i] !== '<') {
      let j = i
      while (j < n && s[j] !== '<') j++
      append({ kind: 'text', raw: s.slice(i, j), pos: i })
      i = j
      continue
    }

    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4)
      if (end < 0) makeError('注释未闭合（缺少 -->）', i)
      append({ kind: 'comment', raw: s.slice(i, end + 3), pos: i })
      i = end + 3
      continue
    }

    if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9)
      if (end < 0) makeError('CDATA 未闭合（缺少 ]]>）', i)
      append({ kind: 'cdata', raw: s.slice(i, end + 3), pos: i })
      i = end + 3
      continue
    }

    if (s.startsWith('<?', i)) {
      const end = s.indexOf('?>', i + 2)
      if (end < 0) makeError('处理指令未闭合（缺少 ?>）', i)
      append({ kind: 'pi', raw: s.slice(i, end + 2), pos: i })
      i = end + 2
      continue
    }

    if (s.startsWith('<!', i)) {
      // DOCTYPE 等声明：允许内部子集 [ ... ]（其中可出现 >）
      let j = i + 2
      let bracket = 0
      let quote = ''
      while (j < n) {
        const ch = s[j]
        if (quote) {
          if (ch === quote) quote = ''
        } else if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '[') {
          bracket++
        } else if (ch === ']') {
          if (bracket > 0) bracket--
        } else if (ch === '>' && bracket === 0) {
          break
        }
        j++
      }
      if (j >= n) makeError('DOCTYPE 未闭合（缺少 >）', i)
      append({ kind: 'doctype', raw: s.slice(i, j + 1), pos: i })
      i = j + 1
      continue
    }

    if (s.startsWith('</', i)) {
      let nameEnd = i + 2
      while (nameEnd < n && !/[\s>]/.test(s[nameEnd])) nameEnd++
      const name = s.slice(i + 2, nameEnd)
      if (!name) makeError('结束标签缺少名称', i)
      if (nameBad(name)) makeError(`结束标签名称不合法：${name}`, i)
      let k = nameEnd
      while (k < n && s[k] !== '>') k++
      if (k >= n) makeError(`结束标签 </${name}> 未闭合（缺少 >）`, i)
      const top = stack[stack.length - 1]
      if (!top) makeError(`多余的结束标签 </${name}>（没有对应的开始标签）`, i)
      if (top.name !== name) makeError(`结束标签 </${name}> 与开始标签 <${top.name}> 不匹配`, i)
      stack.pop()
      i = k + 1
      continue
    }

    const tag = parseOpenTag(i)
    if (tag.selfClose) {
      append({ kind: 'element', name: tag.name, attrs: tag.attrs, selfClose: true, children: [], pos: i })
    } else {
      const node: XmlElementNode = {
        kind: 'element',
        name: tag.name,
        attrs: tag.attrs,
        selfClose: false,
        children: [],
        pos: i
      }
      append(node)
      stack.push(node)
    }
    i = tag.end
  }

  if (stack.length) {
    const top = stack[stack.length - 1]
    makeError(`标签 <${top.name}> 未闭合`, top.pos)
  }

  const rootElements = roots.filter(r => r.kind === 'element') as XmlElementNode[]
  if (rootElements.length === 0) makeError('未找到根元素', 0)
  if (rootElements.length > 1) {
    makeError('存在多个根元素（XML 只能有一个根元素）', rootElements[1].pos)
  }

  return roots
}

/** 按节点树渲染缩进文本 */
function renderXml(nodes: XmlNode[], indent: string, depth: number, out: string[]): void {
  const pad = indent.repeat(depth)
  for (const node of nodes) {
    if (node.kind === 'text') {
      const text = node.raw.trim()
      if (text) out.push(pad + text)
      continue
    }
    if (node.kind !== 'element') {
      out.push(pad + node.raw.trim())
      continue
    }

    const attr = node.attrs.trim()
    const openHead = `<${node.name}${attr ? ' ' + attr : ''}`
    if (node.selfClose) {
      out.push(`${pad}${openHead} />`)
      continue
    }

    const meaningful = node.children.filter(c => !(c.kind === 'text' && !c.raw.trim()))
    if (!meaningful.length) {
      out.push(`${pad}${openHead}></${node.name}>`)
      continue
    }

    if (meaningful.every(c => c.kind === 'text')) {
      const text = meaningful.map(c => (c as XmlRawNode).raw.trim()).join(' ').trim()
      out.push(`${pad}${openHead}>${text}</${node.name}>`)
      continue
    }

    out.push(`${pad}${openHead}>`)
    renderXml(meaningful, indent, depth + 1, out)
    out.push(`${pad}</${node.name}>`)
  }
}

/**
 * 格式化 / 校验 XML 文本
 * @param input 原始 XML 文本
 * @param opts.indent '2' | '4' | 'tab'，或直接传缩进字符串
 */
export function formatXml(input: string, opts: XmlFormatOptions = {}): XmlFormatResult {
  const raw = input ?? ''
  if (!raw.trim()) {
    return {
      ok: false,
      text: '',
      error: { message: '请输入 XML 内容', position: -1, line: -1, column: -1 }
    }
  }

  const key = opts.indent ?? '2'
  const indent = XML_INDENT_MAP[key] ?? opts.indent ?? '  '

  try {
    const roots = parseXml(raw)
    const out: string[] = []
    renderXml(roots, indent, 0, out)
    return { ok: true, text: out.join('\n') }
  } catch (e) {
    if (e instanceof XmlParseError) return { ok: false, text: '', error: e.info }
    return {
      ok: false,
      text: '',
      error: { message: (e as Error).message || 'XML 解析失败', position: -1, line: -1, column: -1 }
    }
  }
}
