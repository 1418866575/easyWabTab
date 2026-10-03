import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'html-to-pdf',
    name: 'HTML 转 PDF',
    icon: '🖨️',
    description: '把 HTML 片段渲染为 PDF（浏览器原生打印管线，零依赖），纯前端零上传',
    category: 'pdf',
    tags: ['pdf', 'html', 'html2pdf', '打印', '转pdf'],
    status: 'active',
    kind: 'internal',
    order: 27,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-10-03'
  },
  component: () => import('./HtmlToPdfTool.vue')
}

export default entry
