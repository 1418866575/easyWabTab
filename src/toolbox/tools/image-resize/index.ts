import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-resize',
    name: '图片尺寸调整',
    icon: '🔧',
    description: '上传图片后调整宽高（可锁定比例）并导出，纯本地处理',
    category: 'image',
    tags: ['图片', '缩放', '尺寸', 'resize'],
    status: 'active',
    kind: 'internal',
    order: 30,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./ImageResizeTool.vue')
}

export default entry
