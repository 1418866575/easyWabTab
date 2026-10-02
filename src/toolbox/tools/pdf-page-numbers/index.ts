import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-page-numbers',
    name: 'PDF 添加页码',
    icon: '🔢',
    description: '为 PDF 每页添加页码，可选位置/格式/起始值，纯前端零上传',
    category: 'pdf',
    tags: ['pdf', '页码', '添加页码', '页脚', 'header'],
    status: 'active',
    kind: 'internal',
    order: 17,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfPageNumbersTool.vue')
}

export default entry
