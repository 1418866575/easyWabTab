import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-merge',
    name: 'PDF 合并与重排',
    icon: '📄',
    description: '选择多个 PDF 按序合并或重排页面，纯本地处理',
    category: 'pdf',
    tags: ['pdf', '合并', 'merge', '重排'],
    status: 'active',
    kind: 'internal',
    order: 10,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfMergeTool.vue')
}

export default entry
