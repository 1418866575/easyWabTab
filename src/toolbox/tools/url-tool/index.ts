import type { ToolboxToolEntry } from '../../types'

/** URL 编解码与参数解析（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'url-tool',
    name: 'URL 编解码与参数解析',
    icon: '🔗',
    description: '编码/解码 URL、解析并编辑 Query 参数、识别 UTM 标签',
    category: 'encode',
    tags: ["url","query","utm"],
    status: 'active',
    kind: 'internal',
    order: 12,
    modalSize: 'M',
    layout: 'T3',
    addedAt: '2026-09-30'
  },
  component: () => import('./UrlTool.vue')
}

export default entry
