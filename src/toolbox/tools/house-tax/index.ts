import type { ToolboxToolEntry } from '../../types'

/** 购房税费计算器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'house-tax',
    name: '购房税费计算器',
    icon: '🧾',
    description: '新房与二手房的契税、增值税、个税、印花税与公共维修基金估算',
    category: 'loan',
    tags: ['契税', '增值税', '个税', '购房'],
    status: 'active',
    kind: 'internal',
    order: 80,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./HouseTaxTool.vue')
}

export default entry
