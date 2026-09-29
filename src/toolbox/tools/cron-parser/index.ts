import type { ToolboxToolEntry } from '../../types'

/** Cron 表达式解析（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'cron-parser',
    name: 'Cron 表达式解析',
    icon: '⏰',
    description: '解析 Cron 字段、生成中文描述与后续执行时间',
    category: 'dev',
    tags: ["cron","定时任务","调度"],
    status: 'active',
    kind: 'internal',
    order: 5,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./CronParserTool.vue')
}

export default entry
