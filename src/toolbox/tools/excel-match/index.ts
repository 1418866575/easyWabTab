import type { ToolboxToolEntry } from '../../types'

/** Excel 数据匹配（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'excel-match',
    name: 'Excel 数据匹配',
    icon: '🔍',
    description: '双表按字段匹配合并（VLOOKUP 式），实时预览并导出 xlsx',
    category: 'data',
    tags: ["excel","vlookup","匹配"],
    status: 'active',
    kind: 'internal',
    order: 23,
    modalSize: 'XL',
    layout: 'T6',
    addedAt: '2026-09-30'
  },
  component: () => import('./ExcelMatchTool.vue')
}

export default entry
