import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-delete-pages',
    name: 'PDF 删除页面',
    icon: '🗑️',
    description: '勾选保留页面，删除其余页面后导出，纯本地处理',
    category: 'pdf',
    tags: ['pdf', '删除页', '删页', 'split'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfDeletePagesTool.vue')
}

export default entry
