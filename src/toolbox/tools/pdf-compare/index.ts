import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-compare',
    name: 'PDF 比较',
    icon: '🔍',
    description: '对比两份 PDF 的文本内容差异（行级 diff），纯前端零上传',
    category: 'pdf',
    tags: ['pdf', '比较', 'compare', 'diff', '差异'],
    status: 'active',
    kind: 'internal',
    order: 25,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfCompareTool.vue')
}

export default entry
