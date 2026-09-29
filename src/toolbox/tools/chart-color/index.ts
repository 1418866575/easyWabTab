import type { ToolboxToolEntry } from '../../types'

/** 图表配色（站内自建） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'chart-color',
    name: '图表配色',
    icon: '🎨',
    description: '按基色生成协调配色方案并输出色值',
    category: 'data',
    tags: ['配色', '设计'],
    status: 'active',
    kind: 'internal',
    order: 6
  },
  component: () => import('./ChartColorTool.vue')
}

export default entry
