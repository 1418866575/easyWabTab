import type { ToolboxToolEntry } from '../../types'

/** JWT 解析与验证（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'jwt-decode',
    name: 'JWT 解析与验证',
    icon: '🎫',
    description: '解码 Header/Payload、检查过期时间并校验 HS256/384/512 签名',
    category: 'dev',
    tags: ["jwt","token","验签"],
    status: 'active',
    kind: 'internal',
    order: 4,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./JwtDecodeTool.vue')
}

export default entry
