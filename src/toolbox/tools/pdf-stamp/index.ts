import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-stamp',
    name: 'PDF 加盖印章',
    icon: '🔏',
    description: '上传 PNG 印章图片，按位置与缩放叠加到 PDF 页面，纯本地处理',
    category: 'pdf',
    tags: ['pdf', '印章', '水印', 'stamp'],
    status: 'active',
    kind: 'internal',
    order: 21,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfStampTool.vue')
}

export default entry
