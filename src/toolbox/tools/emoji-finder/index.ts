import type { ToolboxToolEntry } from '../../types'

/** Emoji 快速查询（站内自建，内置数据，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'emoji-finder',
    name: 'Emoji 快速查询',
    icon: '😀',
    description: '按分类浏览约 300 个常用 Emoji，中英文关键词搜索，点击即复制并记录最近使用',
    category: 'text',
    tags: ["emoji", "表情", "符号", "复制", "表情包"],
    status: 'active',
    kind: 'internal',
    order: 124,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./EmojiFinderTool.vue')
}

export default entry
