import type { ToolboxToolEntry } from '../../types'

/** 存款利息计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'deposit-calc',
    name: '存款利息计算器',
    icon: '🏦',
    description: '1/3/5 年期利息与到期本息对比、滚动续存策略比选、阶梯分配推荐',
    category: 'calc',
    tags: ['存款', '利息', '定期', '阶梯存款', '续存'],
    status: 'active',
    kind: 'internal',
    order: 99,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-28'
  },
  component: () => import('./DepositCalcTool.vue')
}

export default entry
