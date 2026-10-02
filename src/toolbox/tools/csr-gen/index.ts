import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'csr-gen',
    name: 'CSR 证书请求生成',
    icon: '📝',
    description: '生成 RSA 密钥并签发 CSR(PEM)，用于向 CA 申请证书',
    category: 'cert',
    tags: ['csr', '证书请求', 'pem', '证书'],
    status: 'active',
    kind: 'internal',
    order: 13,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./CsrGenTool.vue')
}

export default entry
