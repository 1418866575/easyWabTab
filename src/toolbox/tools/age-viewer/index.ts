import type { ToolboxToolEntry } from '../../types'

/** 年龄查看器（站内自建，生肖年龄对照表，每年自动基于当前年更新） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'age-viewer',
    name: '年龄查看器',
    icon: '🎂',
    description: '生肖年龄对照表：按出生年份与 12 生肖查看今年年龄，范围 1–120 岁，每年自动更新',
    category: 'calc',
    tags: ['年龄', '生肖', '属相', '年份', '计算'],
    status: 'active',
    kind: 'internal',
    order: 92,
    modalSize: 'XL',
    layout: 'T1',
    addedAt: '2026-10-10'
  },
  component: () => import('./AgeViewerTool.vue')
}

export default entry
