import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'doc-meta-edit',
    name: '文档元信息编辑',
    icon: '🏷️',
    description: '修改 docx / xlsx 的核心属性（标题、作者、关键词等）并导出',
    category: 'doc',
    tags: ['元信息', '属性', 'docx', 'xlsx', 'metadata'],
    status: 'active',
    kind: 'internal',
    order: 12,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./DocMetaEditTool.vue')
}

export default entry
