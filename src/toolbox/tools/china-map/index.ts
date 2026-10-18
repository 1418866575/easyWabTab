import type { ToolboxToolEntry } from '../../types'

/** 中国地图（站内自建，纯前端实现，数据随站打包） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'china-map',
    name: '中国地图',
    icon: '🗺️',
    description: '展示我国 34 个省级行政区，各省独立配色并显示省名与省会，含台湾省与南海诸岛、九段线',
    category: 'other',
    tags: ['地图', '省份', '中国', '地理'],
    status: 'active',
    kind: 'internal',
    order: 96,
    modalSize: 'XL',
    layout: 'T5'
  },
  component: () => import('./ChinaMapTool.vue')
}

export default entry
