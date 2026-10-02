import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'curl-to-code',
    name: 'cURL 转代码',
    icon: '📋',
    description: '粘贴 cURL 命令，转换为 fetch / Python requests 等代码片段',
    category: 'dev',
    tags: ['curl', 'fetch', 'requests', '转换', '代码'],
    status: 'active',
    kind: 'internal',
    order: 62,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./CurlToCodeTool.vue')
}

export default entry
