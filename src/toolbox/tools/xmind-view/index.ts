import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'xmind-view',
    name: 'XMind 大纲查看',
    icon: '🧠',
    description: '打开 XMind 文件，解析并查看思维导图大纲结构',
    category: 'doc',
    tags: ['xmind', '思维导图', '大纲', '查看'],
    status: 'active',
    kind: 'internal',
    order: 11,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-10-02'
  },
  component: () => import('./XmindViewTool.vue')
}

export default entry
