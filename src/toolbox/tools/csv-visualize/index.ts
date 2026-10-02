import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'csv-visualize',
    name: 'CSV 可视化',
    icon: '📊',
    description: '粘贴或上传 CSV，自动解析为表格，统计数值列并生成柱状图',
    category: 'data',
    tags: ['csv', '可视化', '表格', '统计', '图表', '数据'],
    status: 'active',
    kind: 'internal',
    order: 52,
    modalSize: 'XL',
    layout: 'T3',
    addedAt: '2026-10-03'
  },
  component: () => import('./CsvVisualizeTool.vue')
}

export default entry
