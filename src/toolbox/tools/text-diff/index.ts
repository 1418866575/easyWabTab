import type { ToolboxToolEntry } from '../../types'

/** 文本差异对比（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'text-diff',
    name: '文本差异对比',
    icon: '↔️',
    description: '行级 + 字符级差异高亮，支持忽略空白/大小写/空行',
    category: 'text',
    tags: ["diff","对比","差异"],
    status: 'active',
    kind: 'internal',
    order: 31,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-09-30'
  },
  component: () => import('./TextDiffTool.vue')
}

export default entry
