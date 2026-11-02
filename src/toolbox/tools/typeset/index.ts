import type { ToolboxToolEntry } from '../../types'

/** 公众号排版（站内自建，markdown-it 渲染 + 主题内联样式） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'typeset',
    name: '公众号排版',
    icon: '📰',
    description: '用 Markdown 写公众号文章，6 套主题实时预览，复制带内联样式的正文直接粘贴',
    category: 'text',
    tags: ["公众号", "排版", "Markdown", "微信", "主题"],
    status: 'active',
    kind: 'internal',
    order: 114,
    modalSize: 'XL',
    layout: 'T2',
    addedAt: '2026-11-02'
  },
  component: () => import('./TypesetTool.vue')
}

export default entry
