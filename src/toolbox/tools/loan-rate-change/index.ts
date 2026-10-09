import type { ToolboxToolEntry } from '../../types'

/** 利率变动还款计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-rate-change',
    name: '利率变动还款计算器',
    icon: '📉',
    description: 'LPR 重定价或转贷后，对比已还与剩余本息的变化',
    category: 'loan',
    tags: ['利率变动', 'LPR', '月供', '调息'],
    status: 'active',
    kind: 'internal',
    order: 78,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./RateChangeTool.vue')
}

export default entry
