import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-compress',
    name: 'PDF 优化精简',
    icon: '🗜️',
    description: '重新保存 PDF 以精简体积（清理元数据/对象流），纯本地处理',
    category: 'pdf',
    tags: ['pdf', '压缩', 'compress', '优化'],
    status: 'active',
    kind: 'internal',
    order: 12,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfCompressTool.vue')
}

export default entry
