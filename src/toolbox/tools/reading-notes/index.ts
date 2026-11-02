import type { ToolboxToolEntry } from '../../types'

/** 读书笔记（站内自建，本地持久化，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'reading-notes',
    name: '读书笔记',
    icon: '📖',
    description: '管理书架与阅读进度，随手记笔记与金句摘抄，可导出 Markdown',
    category: 'doc',
    tags: ["读书", "笔记", "书架", "金句", "摘抄"],
    status: 'active',
    kind: 'internal',
    order: 127,
    modalSize: 'XL',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./ReadingNotesTool.vue')
}

export default entry
