import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-rotate',
    name: 'PDF 页面旋转',
    icon: '🔄',
    description: '将 PDF 全部页面按指定角度旋转后导出，纯本地处理',
    category: 'pdf',
    tags: ['pdf', '旋转', 'rotate'],
    status: 'active',
    kind: 'internal',
    order: 13,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfRotateTool.vue')
}

export default entry
