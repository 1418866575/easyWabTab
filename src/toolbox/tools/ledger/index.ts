import type { ToolboxToolEntry } from '../../types'

/** 销售记账（站内已有模块 → /business） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'ledger',
    name: '销售记账',
    icon: '🧾',
    description: '摆摊进销存与统计报表（站内模块）',
    category: 'effi',
    tags: ['记账', '销售'],
    status: 'active',
    kind: 'module',
    url: '/business',
    order: 13
  }
}

export default entry
