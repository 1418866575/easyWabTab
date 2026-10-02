import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'websocket-test',
    name: 'WebSocket 测试',
    icon: '📡',
    description: '连接 ws/wss 服务，收发消息并实时查看日志，纯本地连接',
    category: 'dev',
    tags: ['websocket', 'ws', '实时', '测试'],
    status: 'active',
    kind: 'internal',
    order: 61,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./WebsocketTestTool.vue')
}

export default entry
