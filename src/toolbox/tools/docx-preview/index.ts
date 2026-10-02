import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'docx-preview',
    name: 'DOCX 预览转 PDF',
    icon: '📄',
    description: '用 mammoth 将 DOCX 渲染为网页预览，并可打印 / 另存为 PDF',
    category: 'doc',
    tags: ['docx', '预览', 'pdf', 'mammoth'],
    status: 'active',
    kind: 'internal',
    order: 13,
    modalSize: 'XL',
    layout: 'T5',
    addedAt: '2026-10-02'
  },
  component: () => import('./DocxPreviewTool.vue')
}

export default entry
