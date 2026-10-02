import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'docx-image-extract',
    name: '文档图片提取',
    icon: '🖼️',
    description: '从 docx / xlsx / pptx / epub 等压缩型文档中提取全部图片并下载',
    category: 'doc',
    tags: ['图片', '提取', 'docx', 'office'],
    status: 'active',
    kind: 'internal',
    order: 10,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./DocxImageExtractTool.vue')
}

export default entry
