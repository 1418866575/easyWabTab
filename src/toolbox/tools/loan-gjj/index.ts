import type { ToolboxToolEntry } from '../../types'

/** 公积金贷款计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-gjj',
    name: '公积金贷款计算器',
    icon: '🏛️',
    description: '按首套/二套公积金利率计算月供、总利息与还款明细',
    category: 'loan',
    tags: ['公积金', '房贷', '月供'],
    status: 'active',
    kind: 'internal',
    order: 74,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./GjjLoanTool.vue')
}

export default entry
