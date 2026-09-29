import type { ToolboxToolEntry } from '../../types'

/** 日历（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'calendar',
    name: '日历',
    icon: '📅',
    description: '年/月切换日历，标识法定节假日与调休上班日',
    category: 'time',
    tags: ["日历","节假日","调休"],
    status: 'active',
    kind: 'internal',
    order: 63,
    modalSize: 'M',
    layout: 'T6',
    addedAt: '2026-09-30'
  },
  component: () => import('./CalendarTool.vue')
}

export default entry
