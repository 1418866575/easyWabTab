import type { ToolboxToolEntry } from '../../types'

/** 时间戳转换（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'timestamp',
    name: '时间戳转换',
    icon: '🕒',
    description: 'Unix 时间戳与日期互转，支持秒/毫秒与批量转换',
    category: 'time',
    tags: ["时间戳","unix","日期"],
    status: 'active',
    kind: 'internal',
    order: 61,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-09-30'
  },
  component: () => import('./TimestampTool.vue')
}

export default entry
