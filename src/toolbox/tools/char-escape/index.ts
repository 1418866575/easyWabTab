import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'char-escape',
    name: '特殊字符转义',
    icon: '🔣',
    description: '对文本进行 HTML / URL / JSON / SQL 转义与反转义，纯本地处理',
    category: 'text',
    tags: ['转义', 'escape', 'html', 'url', 'json'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'L',
    layout: 'T3',
    addedAt: '2026-10-02'
  },
  component: () => import('./CharEscapeTool.vue')
}

export default entry
