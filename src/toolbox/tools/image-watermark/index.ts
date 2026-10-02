import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-watermark',
    name: '图片水印',
    icon: '💧',
    description: '为图片叠加文字或图片水印，支持位置、透明度、旋转与平铺',
    category: 'image',
    tags: ['水印', '图片', 'watermark', '版权'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-10-02'
  },
  component: () => import('./ImageWatermarkTool.vue')
}

export default entry
