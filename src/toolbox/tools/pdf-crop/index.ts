import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-crop',
    name: 'PDF 裁剪',
    icon: '🔪',
    description: '按边距裁剪 PDF 页面（去白边 / 保留区域），纯前端零上传',
    category: 'pdf',
    tags: ['pdf', '裁剪', 'crop', '边距', '页面'],
    status: 'active',
    kind: 'internal',
    order: 22,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfCropTool.vue')
}

export default entry
