import type { ToolboxToolEntry } from '../../types'

/** 购房能力评估（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'house-afford',
    name: '购房能力评估',
    icon: '🧮',
    description: '由现有资金与每月可承受支出，反推可购房总价与单价',
    category: 'loan',
    tags: ['购房', '评估', '预算'],
    status: 'active',
    kind: 'internal',
    order: 81,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./HouseAffordTool.vue')
}

export default entry
