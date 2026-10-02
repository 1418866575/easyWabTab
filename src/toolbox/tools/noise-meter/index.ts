import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'noise-meter',
    name: '环境噪音计',
    icon: '🔊',
    description: '调用麦克风实时估算声压级（相对值），仅本地处理',
    category: 'device',
    tags: ['噪音', '分贝', '麦克风', 'noise'],
    status: 'active',
    kind: 'internal',
    order: 14,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-10-02'
  },
  component: () => import('./NoiseMeterTool.vue')
}

export default entry
