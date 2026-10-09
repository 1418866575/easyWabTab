import type { ToolboxToolEntry } from '../../types'

/** 提前还贷计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-prepay',
    name: '提前还贷计算器',
    icon: '💰',
    description: '部分或全部提前还款，对比「月供不变缩期限」与「期限不变降月供」的省息效果',
    category: 'loan',
    tags: ['提前还款', '还贷', '省息'],
    status: 'active',
    kind: 'internal',
    order: 77,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./PrepayLoanTool.vue')
}

export default entry
