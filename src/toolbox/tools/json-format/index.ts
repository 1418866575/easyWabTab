import type { ToolboxToolEntry } from '../../types'

/** JSON 格式化（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'json-format',
    name: 'JSON 格式化',
    icon: '🧩',
    description: 'JSON 美化、压缩、校验、键排序与树形浏览，精确定位语法错误',
    category: 'dev',
    tags: ["json","格式化","校验","树形"],
    status: 'active',
    kind: 'internal',
    order: 1,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-09-30'
  },
  component: () => import('./JsonFormatTool.vue')
}

export default entry
