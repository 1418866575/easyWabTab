import type { ToolboxToolEntry } from '../../types'

/** 代码美化截图（站内自建，自研高亮 + foreignObject 导出，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'code-screenshot',
    name: '代码美化截图',
    icon: '📸',
    description: '粘贴代码生成带语法高亮的精美卡片图，暗亮两主题，导出 2x PNG',
    category: 'dev',
    tags: ["代码", "截图", "高亮", "分享", "卡片"],
    status: 'active',
    kind: 'internal',
    order: 116,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-11-02'
  },
  component: () => import('./CodeScreenshotTool.vue')
}

export default entry
