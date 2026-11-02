import type { ToolboxToolEntry } from '../../types'

/** 树状任务列表（站内自建，本地持久化，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'task-list',
    name: '任务列表',
    icon: '🗒️',
    description: '多列表分组的树状任务清单，最多三层嵌套，支持状态流转与归档',
    category: 'effi',
    tags: ["任务", "清单", "树状", "子任务", "归档"],
    status: 'active',
    kind: 'internal',
    order: 113,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./TaskListTool.vue')
}

export default entry
