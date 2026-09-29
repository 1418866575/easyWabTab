import type { ToolboxToolEntry } from '../../types'

/** 随机抽签 & 决策转盘（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'random-picker',
    name: '随机抽签 & 决策转盘',
    icon: '🎲',
    description: '转盘抽奖、随机抽签、随机数、骰子与抛硬币五合一',
    category: 'gen',
    tags: ["随机","抽签","转盘"],
    status: 'active',
    kind: 'internal',
    order: 84,
    modalSize: 'M',
    layout: 'T5',
    addedAt: '2026-09-30'
  },
  component: () => import('./RandomPickerTool.vue')
}

export default entry
