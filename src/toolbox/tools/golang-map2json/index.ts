import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'golang-map2json',
    name: 'Go Map 转 JSON',
    icon: '🐹',
    description: '把 Go 复合字面量（map/切片/结构体）解析为 JSON，纯前端零上传',
    category: 'dev',
    tags: ['go', 'golang', 'map', 'json', '复合字面量', '解析', '转换'],
    status: 'active',
    kind: 'internal',
    order: 53,
    modalSize: 'XL',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./GolangMap2JsonTool.vue')
}

export default entry
