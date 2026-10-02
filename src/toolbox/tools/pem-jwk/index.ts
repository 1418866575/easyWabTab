import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pem-jwk',
    name: 'PEM 与 JWK 互转',
    icon: '🔁',
    description: 'RSA 密钥在 PEM 与 JWK/JWKS 之间互转，纯本地处理',
    category: 'cert',
    tags: ['pem', 'jwk', 'jwks', '密钥', '转换'],
    status: 'active',
    kind: 'internal',
    order: 12,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./PemJwkTool.vue')
}

export default entry
