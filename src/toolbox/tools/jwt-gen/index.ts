import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'jwt-gen',
    name: 'JWT 生成器',
    icon: '🪪',
    description: '编辑 header / payload 并用密钥签名生成 JWT（HS256/384/512），与现有 JWT 解析互补',
    category: 'dev',
    tags: ['jwt', 'token', '签名', '生成'],
    status: 'active',
    kind: 'internal',
    order: 45,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./JwtGenTool.vue')
}

export default entry
