import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'api-key',
    name: 'API 密钥 / Token 生成',
    icon: '🎫',
    description: '生成高强度随机密钥、Token 或 UUID，纯本地',
    category: 'cert',
    tags: ['api', '密钥', 'token', 'uuid', '随机'],
    status: 'active',
    kind: 'internal',
    order: 14,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./ApiKeyTool.vue')
}

export default entry
