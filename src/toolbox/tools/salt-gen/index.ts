import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'salt-gen',
    name: '加盐值 (Salt) 生成',
    icon: '🧂',
    description: '生成密码学随机盐值（Hex/Base64），用于口令哈希/密钥派生',
    category: 'cert',
    tags: ['salt', '盐值', '随机', '密钥派生'],
    status: 'active',
    kind: 'internal',
    order: 15,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./SaltGenTool.vue')
}

export default entry
