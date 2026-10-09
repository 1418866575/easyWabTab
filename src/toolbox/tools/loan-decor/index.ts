import type { ToolboxToolEntry } from '../../types'

/** 装修贷款计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-decor',
    name: '装修贷款计算器',
    icon: '🛠️',
    description: '短期装修贷月供与总利息，支持 3 至 60 期常见档位',
    category: 'loan',
    tags: ['装修贷', '月供', '短期贷款'],
    status: 'active',
    kind: 'internal',
    order: 76,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./DecorLoanTool.vue')
}

export default entry
