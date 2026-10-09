import type { ToolboxToolEntry } from '../../types'

/** 贷款反算计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-reverse',
    name: '贷款反算计算器',
    icon: '🔍',
    description: '已知月供反推贷款金额，或已知金额反推实际利率',
    category: 'loan',
    tags: ['反算', '月供', '利率'],
    status: 'active',
    kind: 'internal',
    order: 79,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./ReverseLoanTool.vue')
}

export default entry
