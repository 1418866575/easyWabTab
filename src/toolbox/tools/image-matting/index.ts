import type { ToolboxToolEntry } from '../../types'

/** 图片去背景（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-matting',
    name: '图片去背景',
    icon: '🫧',
    description: '按颜色阈值与灵敏度智能抠图，支持边缘羽化与背景替换',
    category: 'image',
    tags: ["去背景","抠图","透明"],
    status: 'active',
    kind: 'internal',
    order: 44,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-09-30'
  },
  component: () => import('./ImageMattingTool.vue')
}

export default entry
