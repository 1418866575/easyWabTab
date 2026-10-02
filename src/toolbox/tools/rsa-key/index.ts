import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'rsa-key',
    name: 'RSA 密钥生成',
    icon: '🔑',
    description: '本地生成 RSA 公私钥对（PEM 格式），支持 2048/4096 位',
    category: 'cert',
    tags: ['rsa', '密钥', 'pem', '证书'],
    status: 'active',
    kind: 'internal',
    order: 10,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./RsaKeyTool.vue')
}

export default entry
