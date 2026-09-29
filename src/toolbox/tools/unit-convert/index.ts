import type { ToolboxToolEntry } from '../../types'

/** 单位换算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'unit-convert',
    name: '单位换算器',
    icon: '📐',
    description: '长度/重量/温度/面积/体积/速度/数据存储/时间八大类换算',
    category: 'calc',
    tags: ["单位","换算","转换"],
    status: 'active',
    kind: 'internal',
    order: 71,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-09-30'
  },
  component: () => import('./UnitConvertTool.vue')
}

export default entry
