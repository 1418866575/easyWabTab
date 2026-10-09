import type { ToolboxToolEntry } from '../../types'

/** 贷款 / 房贷计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-calc',
    name: '贷款 / 房贷计算器',
    icon: '🏠',
    description: '等额本息与等额本金对比、提前还款模拟与还款明细导出',
    category: 'loan',
    tags: ["房贷","贷款","月供"],
    status: 'active',
    kind: 'internal',
    order: 72,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-09-30'
  },
  component: () => import('./LoanCalcTool.vue')
}

export default entry
