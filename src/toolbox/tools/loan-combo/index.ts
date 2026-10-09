import type { ToolboxToolEntry } from '../../types'

/** 组合贷款计算器（商贷 + 公积金，站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-combo',
    name: '组合贷款计算器',
    icon: '🏦',
    description: '商业贷款与公积金贷款各自计息，合并出每月总月供与总利息',
    category: 'loan',
    tags: ['组合贷', '公积金', '商贷', '月供'],
    status: 'active',
    kind: 'internal',
    order: 75,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./ComboLoanTool.vue')
}

export default entry
