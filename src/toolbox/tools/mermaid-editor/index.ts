import type { ToolboxToolEntry } from '../../types'

/** Mermaid 在线编辑器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'mermaid-editor',
    name: 'Mermaid 在线编辑器',
    icon: '🧭',
    description: '用文本绘制流程图、时序图、类图等，实时渲染并导出 SVG/PNG',
    category: 'dev',
    tags: ["mermaid","流程图","图表"],
    status: 'active',
    kind: 'internal',
    order: 7,
    modalSize: 'XL',
    layout: 'T2',
    addedAt: '2026-09-30'
  },
  component: () => import('./MermaidEditorTool.vue')
}

export default entry
