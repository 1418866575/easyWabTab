/**
 * 博客编辑器 Markdown 文本变换纯函数
 *
 * 与 blogCore 同构：**无 Vue / DOM / 副作用**，可被 scripts/test-blog-core.ts 直接断言。
 * 组件（BlogEditor.vue）只负责：读取 textarea 选区 → 调本文件 → 把结果写回并恢复光标。
 *
 * 设计约束：博客正文渲染使用 markdown-it 且 html:false，仅放行 base64 位图（禁 svg+xml），
 * 因此编辑器只提供「纯 Markdown 语法」级别的插入/包裹，不涉足富文本（WYSIWYG）。
 * 图片一律以内联 base64 data URL 形式插入，经 isAllowedDataImage 白名单校验。
 */

/** 工具栏支持的 Markdown 变换种类（与「Markdown 可行子集」对齐） */
export type MdBlockKind =
  | 'heading-1' | 'heading-2' | 'heading-3'
  | 'bold' | 'italic' | 'strike' | 'highlight' | 'inline-code'
  | 'blockquote' | 'code-block' | 'ul' | 'ol' | 'task-list'
  | 'link' | 'image' | 'table' | 'hr'

export interface MdTransformOptions {
  /** image 专用：图片描述（alt） */
  alt?: string
  /** image 专用：图片地址（base64 data URL） */
  url?: string
  /** table 专用：行数（含表头行），默认 3 */
  tableRows?: number
  /** table 专用：列数，默认 2 */
  tableCols?: number
}

export interface MdTransformResult {
  /** 变换后的完整文本 */
  value: string
  /** 变换后建议恢复的光标起（含） */
  selStart: number
  /** 变换后建议恢复的光标止（不含） */
  selEnd: number
}

// ==================== 选区 / 行工具 ====================

/** 选中区域所跨行的起止（含起始行首、不含末尾换行后）——用于行级变换（标题/引用/列表） */
function selectedLines(value: string, start: number, end: number): { start: number; end: number } {
  const ls = value.lastIndexOf('\n', start - 1) + 1
  let le = value.indexOf('\n', end)
  if (le === -1) le = value.length
  return { start: ls, end: le }
}

// ==================== 行级变换（标题 / 引用 / 列表） ====================

function applyHeading(value: string, start: number, end: number, level: number): MdTransformResult {
  const { start: ls, end: le } = selectedLines(value, start, end)
  const seg = value.slice(ls, le)
  const hashes = '#'.repeat(level) + ' '
  const newLines = seg.split('\n').map(line => {
    const m = /^(#{1,6})\s+/.exec(line)
    if (m) {
      // 已是同级标题 → 移除；其它级 → 改为目标级
      if (m[1].length === level) return line.slice(m[0].length)
      return hashes + line.slice(m[0].length)
    }
    return hashes + line
  })
  const newSeg = newLines.join('\n')
  const newValue = value.slice(0, ls) + newSeg + value.slice(le)
  return { value: newValue, selStart: ls, selEnd: ls + newSeg.length }
}

function applyBlockquote(value: string, start: number, end: number): MdTransformResult {
  const { start: ls, end: le } = selectedLines(value, start, end)
  const seg = value.slice(ls, le)
  const newLines = seg.split('\n').map(line => {
    const m = /^>\s?/.exec(line)
    return m ? line.slice(m[0].length) : `> ${line}`
  })
  const newSeg = newLines.join('\n')
  const newValue = value.slice(0, ls) + newSeg + value.slice(le)
  return { value: newValue, selStart: ls, selEnd: ls + newSeg.length }
}

function applyUnorderedList(value: string, start: number, end: number): MdTransformResult {
  const { start: ls, end: le } = selectedLines(value, start, end)
  const seg = value.slice(ls, le)
  const newLines = seg.split('\n').map(line => {
    const m = /^[-*+]\s+/.exec(line)
    return m ? line.slice(m[0].length) : `- ${line}`
  })
  const newSeg = newLines.join('\n')
  const newValue = value.slice(0, ls) + newSeg + value.slice(le)
  return { value: newValue, selStart: ls, selEnd: ls + newSeg.length }
}

/**
 * 任务列表：给选中行加/去 `- [ ] ` 前缀。
 * - 已是任务项 → 去前缀（二次点击取消）
 * - 已是普通列表项 → 在项目符号后插入 `[ ] `
 * - 普通段落 → 整体加 `- [ ] `
 */
function applyTaskList(value: string, start: number, end: number): MdTransformResult {
  const { start: ls, end: le } = selectedLines(value, start, end)
  const seg = value.slice(ls, le)
  const newLines = seg.split('\n').map(line => {
    const task = /^\s*[-*+]\s\[( |x|X)\]\s?/.exec(line)
    if (task) return line.slice(task[0].length)
    const bullet = /^\s*[-*+]\s+/.exec(line)
    if (bullet) return bullet[0] + '[ ] ' + line.slice(bullet[0].length)
    return '- [ ] ' + line.replace(/^\s+/, '')
  })
  const newSeg = newLines.join('\n')
  const newValue = value.slice(0, ls) + newSeg + value.slice(le)
  return { value: newValue, selStart: ls, selEnd: ls + newSeg.length }
}

function applyOrderedList(value: string, start: number, end: number): MdTransformResult {
  const { start: ls, end: le } = selectedLines(value, start, end)
  const seg = value.slice(ls, le)
  const newLines = seg.split('\n').map((line, i) => {
    const m = /^\d+\.\s+/.exec(line)
    if (m) return line.slice(m[0].length)
    return `${i + 1}. ${line}`
  })
  const newSeg = newLines.join('\n')
  const newValue = value.slice(0, ls) + newSeg + value.slice(le)
  return { value: newValue, selStart: ls, selEnd: ls + newSeg.length }
}

// ==================== 包裹变换（加粗 / 斜体 / 删除线 / 行内代码） ====================

function applyWrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string
): MdTransformResult {
  const sel = value.slice(start, end)
  const beforeText = value.slice(Math.max(0, start - before.length), start)
  const afterText = value.slice(end, end + after.length)
  // 已包裹则切换为移除（仅当 before/after 长度相等时数学成立，本文件所有包裹场景均满足）
  if (beforeText === before && afterText === after) {
    const newValue = value.slice(0, start - before.length) + sel + value.slice(end + after.length)
    return { value: newValue, selStart: start - before.length, selEnd: start - before.length + sel.length }
  }
  const inner = sel.length > 0 ? sel : placeholder
  const insert = before + inner + after
  const newValue = value.slice(0, start) + insert + value.slice(end)
  const newSelStart = start + before.length
  const newSelEnd = newSelStart + inner.length
  return { value: newValue, selStart: newSelStart, selEnd: newSelEnd }
}

function applyCodeBlock(value: string, start: number, end: number): MdTransformResult {
  const sel = value.slice(start, end)
  if (sel.length > 0) {
    const insert = '```\n' + sel + '\n```'
    const newValue = value.slice(0, start) + insert + value.slice(end)
    return { value: newValue, selStart: start, selEnd: start + insert.length }
  }
  const insert = '```\n代码块\n```'
  const newValue = value.slice(0, start) + insert + value.slice(end)
  const pos = start + 4 // '```\n'
  return { value: newValue, selStart: pos, selEnd: pos + 3 }
}

// ==================== 链接 / 图片 ====================

function applyLink(value: string, start: number, end: number): MdTransformResult {
  const sel = value.slice(start, end)
  const text = sel.length > 0 ? sel : '链接文字'
  const insert = `[${text}](https://)`
  const newValue = value.slice(0, start) + insert + value.slice(end)
  const urlStart = start + 1 + text.length + 2 // '[' + text + ']('
  const urlEnd = urlStart + 'https://'.length
  return { value: newValue, selStart: urlStart, selEnd: urlEnd }
}

function applyImage(
  value: string,
  start: number,
  end: number,
  opts: MdTransformOptions = {}
): MdTransformResult {
  const alt = opts.alt ?? '图片描述'
  const url = opts.url ?? ''
  const insert = `![${alt}](${url})`
  const newValue = value.slice(0, start) + insert + value.slice(end)
  const caret = start + insert.length
  return { value: newValue, selStart: caret, selEnd: caret }
}

// ==================== 表格 / 分割线 ====================

const TABLE_MAX_ROWS = 10
const TABLE_MAX_COLS = 8

/** 按行列数生成 Markdown 表格（含表头行；行列值做上下限钳制，避免误传导致巨表） */
export function buildTableTemplate(rows = 3, cols = 2): string {
  const r = Math.min(TABLE_MAX_ROWS, Math.max(2, Math.round(rows)))
  const c = Math.min(TABLE_MAX_COLS, Math.max(1, Math.round(cols)))
  const head = `| ${Array.from({ length: c }, (_, i) => `列${i + 1}`).join(' | ')} |`
  const sep = `| ${Array.from({ length: c }, () => '---').join(' | ')} |`
  const body = Array.from({ length: r - 1 }, () => `| ${Array.from({ length: c }, () => '单元格').join(' | ')} |`).join('\n')
  return `${head}\n${sep}\n${body}`
}

function surroundBlank(value: string, start: number, end: number, block: string): MdTransformResult {
  const needBefore = start > 0 && value[start - 1] !== '\n'
  const needAfter = end < value.length && value[end] !== '\n'
  const before = needBefore ? '\n' : ''
  const after = needAfter ? '\n' : ''
  const insert = before + block + after
  const newValue = value.slice(0, start) + insert + value.slice(end)
  const innerStart = start + before.length
  return { value: newValue, selStart: innerStart, selEnd: innerStart + block.length }
}

function applyTable(value: string, start: number, end: number, opts: MdTransformOptions = {}): MdTransformResult {
  return surroundBlank(value, start, end, buildTableTemplate(opts.tableRows, opts.tableCols))
}

function applyHr(value: string, start: number, end: number): MdTransformResult {
  return surroundBlank(value, start, end, '---')
}

// ==================== 总入口 ====================

/** 在 value 的 [start,end) 选区应用某种 Markdown 变换，返回新文本与建议光标。无副作用。 */
export function applyMarkdown(
  kind: MdBlockKind,
  value: string,
  start: number,
  end: number,
  opts: MdTransformOptions = {}
): MdTransformResult {
  switch (kind) {
    case 'heading-1': return applyHeading(value, start, end, 1)
    case 'heading-2': return applyHeading(value, start, end, 2)
    case 'heading-3': return applyHeading(value, start, end, 3)
    case 'bold': return applyWrap(value, start, end, '**', '**', '加粗文字')
    case 'italic': return applyWrap(value, start, end, '*', '*', '斜体文字')
    case 'strike': return applyWrap(value, start, end, '~~', '~~', '删除线')
    // 高亮：==文字== → 渲染为 <mark>（noteMarkdown 内置了 == 的行内规则）
    case 'highlight': return applyWrap(value, start, end, '==', '==', '高亮文字')
    case 'inline-code': return applyWrap(value, start, end, '`', '`', '代码')
    case 'blockquote': return applyBlockquote(value, start, end)
    case 'code-block': return applyCodeBlock(value, start, end)
    case 'ul': return applyUnorderedList(value, start, end)
    case 'ol': return applyOrderedList(value, start, end)
    case 'task-list': return applyTaskList(value, start, end)
    case 'link': return applyLink(value, start, end)
    case 'image': return applyImage(value, start, end, opts)
    case 'table': return applyTable(value, start, end, opts)
    case 'hr': return applyHr(value, start, end)
  }
}

// 图片白名单校验已移至 blogImages.ts（与图片库同域）；此处 re-export 保持既有引用路径可用。
export { isAllowedDataImage } from './blogImages'
