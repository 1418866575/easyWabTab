import type { ToolboxToolEntry } from '../../types'

/** 图片压缩与格式转换（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-compress',
    name: '图片压缩与格式转换',
    icon: '🖼️',
    description: 'PNG/JPG/WebP/BMP 互转，质量与尺寸调节，支持批量处理',
    category: 'image',
    tags: ["图片","压缩","webp"],
    status: 'active',
    kind: 'internal',
    order: 41,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-09-30'
  },
  component: () => import('./ImageCompressTool.vue')
}

export default entry
