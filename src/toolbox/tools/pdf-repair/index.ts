import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-repair',
    name: 'PDF 修复',
    icon: '🛠️',
    description: '重新解析并保存损坏/异常的 PDF，修复常见结构问题，纯前端零上传',
    category: 'pdf',
    tags: ['pdf', '修复', 'repair', '重建', '恢复'],
    status: 'active',
    kind: 'internal',
    order: 19,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfRepairTool.vue')
}

export default entry
