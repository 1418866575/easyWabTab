import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-to-office',
    name: 'PDF 转 Office',
    icon: '📎',
    description: '把 PDF 文本提取为 Word/Excel/PowerPoint（文本版，无版式/样式），纯前端零上传',
    category: 'pdf',
    tags: ['pdf', 'office', 'docx', 'xlsx', 'pptx', '转word', '转excel', '转ppt'],
    status: 'active',
    kind: 'internal',
    order: 26,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfToOfficeTool.vue')
}

export default entry
