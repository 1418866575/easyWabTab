import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'csr-parse',
    name: 'CSR 解析',
    icon: '📜',
    description: '解析证书签名请求 (CSR)，查看主题、签名算法与公钥信息',
    category: 'cert',
    tags: ['csr', '证书', '解析', 'x509'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-10-02'
  },
  component: () => import('./CsrParseTool.vue')
}

export default entry
