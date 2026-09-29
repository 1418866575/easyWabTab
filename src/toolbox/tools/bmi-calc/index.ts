import type { ToolboxToolEntry } from '../../types'

/** BMI 与每日热量计算（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'bmi-calc',
    name: 'BMI 与每日热量计算',
    icon: '⚖️',
    description: 'BMI、基础代谢、每日热量、理想体重与三大营养素分配',
    category: 'calc',
    tags: ["bmi","热量","健康"],
    status: 'active',
    kind: 'internal',
    order: 73,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-09-30'
  },
  component: () => import('./BmiCalcTool.vue')
}

export default entry
