import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'x509-parse',
    name: 'X.509 证书解析',
    icon: '📜',
    description: '粘贴 X.509 证书(PEM)解析主题/签发者/有效期/指纹，纯本地',
    category: 'cert',
    tags: ['x509', '证书', '解析', 'certificate', '指纹'],
    status: 'active',
    kind: 'internal',
    order: 11,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./X509ParseTool.vue')
}

export default entry
