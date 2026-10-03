import type { ToolboxToolEntry } from '../../types'

/** 年会抽奖（站内自建，名单存 IndexedDB，支持大屏投屏） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'lottery',
    name: '年会抽奖',
    icon: '🎉',
    description: '导入名单按奖项随机抽奖，中奖者不再复抽，记录留痕，支持大屏投屏',
    category: 'gen',
    tags: ['抽奖', '年会', '幸运', '大屏', 'lottery'],
    status: 'active',
    kind: 'internal',
    order: 86,
    modalSize: 'XL',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./LotteryTool.vue')
}

export default entry
