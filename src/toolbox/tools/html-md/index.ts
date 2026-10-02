import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'html-md',
    name: 'HTML 与 Markdown 互转',
    icon: '🔃',
    description: 'HTML → Markdown（turndown）或 Markdown → HTML（markdown-it），本地转换',
    category: 'doc',
    tags: ['html', 'markdown', '转换'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./HtmlMdTool.vue')
}

export default entry
