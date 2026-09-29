import type { ToolboxToolEntry } from '../../types'

/** 图片滤镜（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-filter',
    name: '图片滤镜',
    icon: '✨',
    description: '亮度/对比度/饱和度/色相调节与预设艺术滤镜，实时预览',
    category: 'image',
    tags: ["滤镜","调色","图片"],
    status: 'active',
    kind: 'internal',
    order: 42,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-09-30'
  },
  component: () => import('./ImageFilterTool.vue')
}

export default entry
