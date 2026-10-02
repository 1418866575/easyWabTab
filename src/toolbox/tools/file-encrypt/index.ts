import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'file-encrypt',
    name: '文件加密 / 解密',
    icon: '🛡️',
    description: '用口令(AES-256-GCM)加密或解密任意文件，纯本地',
    category: 'cert',
    tags: ['加密', '解密', 'aes', '文件', '口令'],
    status: 'active',
    kind: 'internal',
    order: 16,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./FileEncryptTool.vue')
}

export default entry
