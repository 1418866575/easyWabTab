import type { ToolboxToolEntry } from '../../types'

/** Markdown 编辑预览（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'markdown-editor',
    name: 'Markdown 编辑预览',
    icon: '📝',
    description: 'Markdown 实时预览、GFM 支持、代码高亮与导出 HTML',
    category: 'text',
    tags: ["markdown","预览","文档"],
    status: 'active',
    kind: 'internal',
    order: 32,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-09-30'
  },
  component: () => import('./MarkdownEditorTool.vue')
}

export default entry
