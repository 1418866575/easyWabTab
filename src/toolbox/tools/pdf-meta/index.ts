import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-meta',
    name: 'PDF 信息与元数据',
    icon: '🏷️',
    description: '查看 PDF 页数/页面尺寸，编辑标题/作者等元数据并导出，纯本地',
    category: 'pdf',
    tags: ['pdf', '元数据', '信息', 'metadata'],
    status: 'active',
    kind: 'internal',
    order: 14,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfMetaTool.vue')
}

export default entry
