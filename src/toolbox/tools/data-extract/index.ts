import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'data-extract',
    name: '文本数据提取',
    icon: '🔎',
    description: '从大段文本中提取邮箱、网址、IP、手机号与 JSON，便于批量复制导出',
    category: 'text',
    tags: ['提取', '邮箱', '网址', '手机号', 'json', '正则'],
    status: 'active',
    kind: 'internal',
    order: 41,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./DataExtractTool.vue')
}

export default entry
