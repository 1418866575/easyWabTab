import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'sci-calc',
    name: '科学计算器',
    icon: '🧮',
    description: '支持四则运算、括号与常用函数（sin/cos/tan/log/sqrt…）的本地科学计算器',
    category: 'calc',
    tags: ['计算器', 'calc', '科学'],
    status: 'active',
    kind: 'internal',
    order: 70,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./SciCalcTool.vue')
}

export default entry
