import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-to-pdf',
    name: '图片转 PDF',
    icon: '🖼️',
    description: '把多张本地图片合成为 PDF，支持 A4 适配或原始尺寸，纯前端零上传',
    category: 'pdf',
    tags: ['图片', 'pdf', '转换', '合并', 'jpg', 'png'],
    status: 'active',
    kind: 'internal',
    order: 16,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./ImageToPdfTool.vue')
}

export default entry
