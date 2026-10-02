import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-to-pdf',
    name: '图片转 PDF',
    icon: '🖼️',
    description: '多张图片合并为一个 PDF，每图一页，纯本地处理',
    category: 'image',
    tags: ['图片', '转PDF', '合并', 'pdf'],
    status: 'active',
    kind: 'internal',
    order: 32,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./ImageToPdfTool.vue')
}

export default entry
