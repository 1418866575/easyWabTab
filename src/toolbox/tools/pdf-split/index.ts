import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-split',
    name: 'PDF 拆分与提取页',
    icon: '✂️',
    description: '将 PDF 按页拆分，或提取选中页导出为新 PDF，纯本地处理',
    category: 'pdf',
    tags: ['pdf', '拆分', 'split', '提取页'],
    status: 'active',
    kind: 'internal',
    order: 11,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfSplitTool.vue')
}

export default entry
