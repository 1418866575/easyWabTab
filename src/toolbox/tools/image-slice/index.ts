import type { ToolboxToolEntry } from '../../types'

/** 图片切图工具（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-slice',
    name: '图片切图工具',
    icon: '🔪',
    description: '按透明像素自动检测分割雪碧图，可调节灵敏度并批量下载',
    category: 'image',
    tags: ["切图","雪碧图","分割"],
    status: 'active',
    kind: 'internal',
    order: 45,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-09-30'
  },
  component: () => import('./ImageSliceTool.vue')
}

export default entry
