import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'cors-check',
    name: 'CORS 跨域检查',
    icon: '🔒',
    description: '输入请求来源与响应头，判断浏览器是否会放行跨域请求，并附带 CORS 说明',
    category: 'dev',
    tags: ['cors', '跨域', '检查', '安全'],
    status: 'active',
    kind: 'internal',
    order: 64,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./CorsCheckTool.vue')
}

export default entry
