import type { ToolboxToolEntry } from '../../types'

/** SVG 编辑器（站内自建，代码 ⇄ 渲染，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'svg-editor',
    name: 'SVG 编辑器',
    icon: '✏️',
    description: '左侧写 SVG 代码、右侧即时渲染，安全清洗后可导出 SVG 与 PNG',
    category: 'dev',
    tags: ["SVG", "矢量", "图标", "编辑器", "预览"],
    status: 'active',
    kind: 'internal',
    order: 105,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-11-02'
  },
  component: () => import('./SvgEditorTool.vue')
}

export default entry
