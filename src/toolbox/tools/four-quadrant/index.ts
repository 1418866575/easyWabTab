import type { ToolboxToolEntry } from '../../types'

/** 四象限笔记（站内自建，本地持久化，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'four-quadrant',
    name: '四象限笔记',
    icon: '🗂️',
    description: '按重要 / 紧急四象限整理任务，支持移动象限、完成态与本地保存',
    category: 'effi',
    tags: ["四象限", "任务", "优先级", "笔记", "艾森豪威尔"],
    status: 'active',
    kind: 'internal',
    order: 110,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./FourQuadrantTool.vue')
}

export default entry
