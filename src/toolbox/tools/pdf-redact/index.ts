import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-redact',
    name: 'PDF 标记密文',
    icon: '🖍️',
    description: '按关键词或页边距在 PDF 上涂黑敏感内容（不可逆，生成新文件），纯前端零上传',
    category: 'pdf',
    tags: ['pdf', '密文', 'redact', '涂黑', '脱敏'],
    status: 'active',
    kind: 'internal',
    order: 24,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfRedactTool.vue')
}

export default entry
