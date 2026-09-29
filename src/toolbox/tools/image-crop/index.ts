import type { ToolboxToolEntry } from '../../types'

/** 图片截图工具（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-crop',
    name: '图片截图工具',
    icon: '✂️',
    description: '上传图片后矩形框选多次截图，支持比例锁定与原图坐标导出',
    category: 'image',
    tags: ["截图","裁剪","选区"],
    status: 'active',
    kind: 'internal',
    order: 43,
    modalSize: 'XL',
    layout: 'T5',
    addedAt: '2026-09-30'
  },
  component: () => import('./ImageCropTool.vue')
}

export default entry
