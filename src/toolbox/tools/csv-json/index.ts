import type { ToolboxToolEntry } from '../../types'

/** CSV 与 JSON 互转（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'csv-json',
    name: 'CSV 与 JSON 互转',
    icon: '🔄',
    description: 'CSV 与 JSON 双向转换，支持自定义分隔符与表头设置',
    category: 'data',
    tags: ["csv","json","转换"],
    status: 'active',
    kind: 'internal',
    order: 21,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-09-30'
  },
  component: () => import('./CsvJsonTool.vue')
}

export default entry
