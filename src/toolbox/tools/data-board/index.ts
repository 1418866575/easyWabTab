import type { ToolboxToolEntry } from '../../types'

/**
 * 数据看板（规划中）
 * 状态为 coming：列表置灰不可点，实现就绪后把 status 改为 active
 * 并补上 component: () => import('./DataBoardTool.vue') 即可上线。
 */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'data-board',
    name: '数据看板',
    icon: '📈',
    description: '汇总各模块关键指标的可视化看板',
    category: 'data',
    tags: ['看板', '统计'],
    status: 'coming',
    kind: 'internal',
    order: 7
  }
}

export default entry
