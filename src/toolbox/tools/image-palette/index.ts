import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-palette',
    name: '图片配色提取',
    icon: '🎨',
    description: '上传图片提取主色配色方案，支持复制 HEX/CSS，纯本地处理',
    category: 'image',
    tags: ['图片', '配色', '调色板', 'palette', '主色'],
    status: 'active',
    kind: 'internal',
    order: 31,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./ImagePaletteTool.vue')
}

export default entry
