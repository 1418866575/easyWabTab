import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-unlock',
    name: 'PDF 解锁',
    icon: '🔓',
    description: '用已知打开密码移除 PDF 保护另存为无密码文件，纯前端零上传',
    category: 'pdf',
    tags: ['pdf', '解锁', '密码', '加密', 'decrypt'],
    status: 'active',
    kind: 'internal',
    order: 18,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfUnlockTool.vue')
}

export default entry
