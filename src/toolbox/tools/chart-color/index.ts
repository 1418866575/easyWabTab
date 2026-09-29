import type { ToolboxToolEntry } from '../../types'

/** 图表配色（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'chart-color',
    name: '图表配色',
    icon: '🎨',
    description: '按基色生成协调配色方案并输出色值，适合图表与界面设计',
    category: 'color',
    tags: ["配色","设计","图表"],
    status: 'active',
    kind: 'internal',
    order: 52,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-09-30'
  },
  component: () => import('./ChartColorTool.vue')
}

export default entry
