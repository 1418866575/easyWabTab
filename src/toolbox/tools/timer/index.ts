import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'timer',
    name: '计时器与秒表',
    icon: '⏱️',
    description: '倒计时（可设时/分/秒）与秒表（计次），纯本地计时，无网络',
    category: 'device',
    tags: ['计时器', '倒计时', '秒表', 'timer'],
    status: 'active',
    kind: 'internal',
    order: 10,
    modalSize: 'S',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./TimerTool.vue')
}

export default entry
