import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'citation-format',
    name: '引用格式化',
    icon: '📚',
    description: '按 GB/T 7714、APA、MLA 等规范生成文献引用格式，纯本地',
    category: 'doc',
    tags: ['引用', 'citation', 'gb7714', 'apa', 'mla'],
    status: 'active',
    kind: 'internal',
    order: 10,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./CitationTool.vue')
}

export default entry
