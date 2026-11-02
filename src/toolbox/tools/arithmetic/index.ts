import type { ToolboxToolEntry } from '../../types'

/** 算术题生成器（站内自建，A4 排版打印，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'arithmetic',
    name: '算术题生成器',
    icon: '➗',
    description: '一键生成小学加减乘除口算题，数值范围与栏数可调，A4 排版打印并附答案',
    category: 'doc',
    tags: ["口算", "算术", "数学", "打印", "练习"],
    status: 'active',
    kind: 'internal',
    order: 126,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./ArithmeticTool.vue')
}

export default entry
