import type { ToolboxToolEntry } from '../../types'

/** 待办事项（站内自建，本地持久化，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'todo',
    name: '待办事项',
    icon: '✅',
    description: '分类管理、三状态流转与拖拽排序的个人待办清单，本地保存',
    category: 'effi',
    tags: ["待办", "任务", "清单", "分类", "todo"],
    status: 'active',
    kind: 'internal',
    order: 111,
    modalSize: 'M',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./TodoTool.vue')
}

export default entry
