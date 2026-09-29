import type { ToolboxToolEntry } from '../../types'

/** Cron 表达式生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'cron-builder',
    name: 'Cron 表达式生成器',
    icon: '⏰',
    description: '可视化构建 Cron 表达式，实时预览、复制与验证',
    category: 'dev',
    tags: ['cron', '生成器', '定时任务', '调度', '可视化'],
    status: 'active',
    kind: 'internal',
    order: 6,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./CronBuilderTool.vue')
}

export default entry
