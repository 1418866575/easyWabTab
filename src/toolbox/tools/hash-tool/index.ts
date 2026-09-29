import type { ToolboxToolEntry } from '../../types'

/** Hash 生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'hash-tool',
    name: 'Hash 生成器',
    icon: '#️⃣',
    description: 'MD5 / SHA-1 / SHA-224/256/384/512 摘要与 HMAC，支持大小写切换',
    category: 'encode',
    tags: ["md5","sha256","hash","hmac"],
    status: 'active',
    kind: 'internal',
    order: 13,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./HashTool.vue')
}

export default entry
