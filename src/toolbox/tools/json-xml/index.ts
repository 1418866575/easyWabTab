import type { ToolboxToolEntry } from '../../types'

/** JSON 转 XML / Excel（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'json-xml',
    name: 'JSON 转 XML / Excel',
    icon: '📤',
    description: 'JSON 导出为 XML 或 Excel 表格，可配置根元素与数组节点名',
    category: 'data',
    tags: ["xml","excel","导出"],
    status: 'active',
    kind: 'internal',
    order: 22,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./JsonXmlTool.vue')
}

export default entry
