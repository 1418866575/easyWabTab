import type { ToolboxToolEntry } from '../../types'

/** 元素周期表（站内自建，纯前端，数据离线内置） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'periodic-table',
    name: '元素周期表',
    icon: '⚛️',
    description: '完整展示 118 个化学元素，按分类着色，支持搜索、分类高亮、周期/族筛选与元素详情查看',
    category: 'science',
    tags: ['元素', '周期表', '化学', '原子', '周期'],
    status: 'active',
    kind: 'internal',
    order: 10,
    modalSize: 'XL',
    layout: 'T1'
  },
  component: () => import('./PeriodicTableTool.vue')
}

export default entry
