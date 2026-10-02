import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-toc',
    name: 'PDF 目录提取',
    icon: '📑',
    description: '读取 PDF 内置书签/大纲目录，以层级树展示，可复制为 Markdown 或导出 JSON',
    category: 'pdf',
    tags: ['pdf', '目录', '大纲', '书签', 'toc', 'outline'],
    status: 'active',
    kind: 'internal',
    order: 60,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./PdfTocTool.vue')
}

export default entry
