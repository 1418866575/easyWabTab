import type { ToolboxToolEntry } from '../../types'

/** Base64 编解码（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'base64-tool',
    name: 'Base64 编解码',
    icon: '🔤',
    description: '文本与文件的 Base64 编码/解码，支持 URL-safe 变体与换行',
    category: 'encode',
    tags: ["base64","编码","解码"],
    status: 'active',
    kind: 'internal',
    order: 11,
    modalSize: 'M',
    layout: 'T2',
    addedAt: '2026-09-30'
  },
  component: () => import('./Base64Tool.vue')
}

export default entry
