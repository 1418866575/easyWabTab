import type { ToolboxToolEntry } from '../../types'

/** 图片压缩（站内自建，本地处理不上传） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'image-compress',
    name: '图片压缩',
    icon: '🖼️',
    description: '本地压缩图片体积，不上传任何服务器',
    category: 'media',
    tags: ['图片', '压缩'],
    status: 'active',
    kind: 'internal',
    order: 8
  },
  component: () => import('./ImageCompressTool.vue')
}

export default entry
