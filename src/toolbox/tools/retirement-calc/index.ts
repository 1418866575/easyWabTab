import type { ToolboxToolEntry } from '../../types'

/** 退休年龄计算器（依据渐进式延迟法定退休年龄政策，站内自建、纯前端） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'retirement-calc',
    name: '退休年龄计算器',
    icon: '🧓',
    description: '按 2025 年渐进式延迟退休政策，测算法定退休年龄、预计退休时间、距退休年限与弹性区间',
    category: 'calc',
    tags: ['退休', '年龄', '延迟退休', '社保', '养老', '计算'],
    status: 'active',
    kind: 'internal',
    order: 97,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-10-27'
  },
  component: () => import('./RetirementCalcTool.vue')
}

export default entry
