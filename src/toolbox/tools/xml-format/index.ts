import type { ToolboxToolEntry } from '../../types'

/** XML 格式化（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'xml-format',
    name: 'XML 格式化',
    icon: '📃',
    description: 'XML 美化与校验，层级清晰缩进，结构错误定位到行列，保留注释/CDATA',
    category: 'dev',
    tags: ['xml', '格式化', '美化', '校验', '缩进'],
    status: 'active',
    kind: 'internal',
    order: 98,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-27'
  },
  component: () => import('./XmlFormatTool.vue')
}

export default entry
