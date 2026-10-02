import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'http-header-parse',
    name: 'HTTP 响应头解析',
    icon: '🧾',
    description: '粘贴 HTTP 响应头，解析为结构化表格并检查常见安全响应头',
    category: 'dev',
    tags: ['header', '响应头', '解析', '安全'],
    status: 'active',
    kind: 'internal',
    order: 63,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./HttpHeaderParseTool.vue')
}

export default entry
