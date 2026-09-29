import type { ToolboxToolEntry } from '../../types'

/** 世界时钟与时区转换（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'world-clock',
    name: '世界时钟与时区转换',
    icon: '🌍',
    description: '多城市时钟并列、时区换算与倒计时，自动处理夏令时',
    category: 'time',
    tags: ["时区","时钟","倒计时"],
    status: 'active',
    kind: 'internal',
    order: 62,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-09-30'
  },
  component: () => import('./WorldClockTool.vue')
}

export default entry
