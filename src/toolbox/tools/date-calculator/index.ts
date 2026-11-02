import type { ToolboxToolEntry } from '../../types'

/** 日期计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'date-calculator',
    name: '日期计算器',
    icon: '📅',
    description: '日期加减推算与两日期间隔，含工作日口径（剔除节假日、计入调休）',
    category: 'time',
    tags: ["日期", "间隔", "工作日", "倒计时", "推算"],
    status: 'active',
    kind: 'internal',
    order: 102,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./DateCalculatorTool.vue')
}

export default entry
