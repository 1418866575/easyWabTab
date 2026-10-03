import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-to-markdown',
    name: 'PDF 转 Markdown',
    icon: '📝',
    description: '提取 PDF 文本并按版式（标题/段落/列表）转为 Markdown，纯前端零上传',
    category: 'pdf',
    tags: ['pdf', 'markdown', '转markdown', '文本提取', 'md'],
    status: 'active',
    kind: 'internal',
    order: 23,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfToMarkdownTool.vue')
}

export default entry
