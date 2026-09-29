import type { ToolboxToolEntry } from '../../types'

/** Favicon 生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'favicon-gen',
    name: 'Favicon 生成器',
    icon: '🌟',
    description: '一键生成全套网站图标、ICO、manifest.json 与 HTML 代码片段',
    category: 'image',
    tags: ["favicon","图标","ico"],
    status: 'active',
    kind: 'internal',
    order: 46,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./FaviconGenTool.vue')
}

export default entry
