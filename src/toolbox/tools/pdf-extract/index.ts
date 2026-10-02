import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-extract',
    name: 'PDF 提取文字 / 转图',
    icon: '📤',
    description: '提取 PDF 全部文字，或将每页渲染为 PNG 图片，纯本地',
    category: 'pdf',
    tags: ['pdf', '提取', '文字', '转图', 'extract'],
    status: 'active',
    kind: 'internal',
    order: 15,
    modalSize: 'XL',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfExtractTool.vue')
}

export default entry
