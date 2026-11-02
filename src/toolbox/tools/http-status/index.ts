import type { ToolboxToolEntry } from '../../types'

/** HTTP 状态码速查（站内自建，内置数据，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'http-status',
    name: 'HTTP 状态码速查',
    icon: '📮',
    description: '1xx–5xx 常用状态码手册，分类浏览与关键字搜索，附中文说明与典型场景',
    category: 'dev',
    tags: ["HTTP", "状态码", "404", "500", "速查"],
    status: 'active',
    kind: 'internal',
    order: 118,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./HttpStatusTool.vue')
}

export default entry
