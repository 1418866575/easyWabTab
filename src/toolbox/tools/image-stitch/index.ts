import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-stitch',
    name: '图片长图拼接',
    icon: '🧵',
    description: '多张本地图片竖向/横向拼接为一张长图，纯前端零上传',
    category: 'image',
    tags: ['长图', '拼接', '合并', '拼图', 'stitch', '图片'],
    status: 'active',
    kind: 'internal',
    order: 56,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-10-03'
  },
  component: () => import('./ImageStitchTool.vue')
}

export default entry
