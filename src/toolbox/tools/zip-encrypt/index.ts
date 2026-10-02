import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'zip-encrypt',
    name: '加密压缩包',
    icon: '📦',
    description: '多文件打包为 ZIP 并用口令(AES-256-GCM)加密，或解密还原',
    category: 'cert',
    tags: ['zip', '加密', '压缩', '口令', 'aes'],
    status: 'active',
    kind: 'internal',
    order: 17,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./ZipEncryptTool.vue')
}

export default entry
