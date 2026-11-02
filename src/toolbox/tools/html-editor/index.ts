import type { ToolboxToolEntry } from '../../types'

/** HTML 编辑器（站内自建，沙箱预览，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'html-editor',
    name: 'HTML 编辑器',
    icon: '📝',
    description: 'HTML / CSS / JS 三栏编写与实时沙箱预览，内置模板，可导出独立 HTML 文件',
    category: 'dev',
    tags: ["HTML", "CSS", "JS", "编辑器", "预览", "沙箱"],
    status: 'active',
    kind: 'internal',
    order: 104,
    modalSize: 'XL',
    layout: 'T2',
    addedAt: '2026-11-02'
  },
  component: () => import('./HtmlEditorTool.vue')
}

export default entry
