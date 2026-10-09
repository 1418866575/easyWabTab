import type { ToolboxToolEntry } from '../../types'

/** LPR 与基准利率速查（站内自建，数据为内置静态快照） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'loan-lpr',
    name: 'LPR 与基准利率速查',
    icon: '📉',
    description: 'LPR / 商业基准利率 / 公积金利率 / 最低首付比例速查，并支持基点加点换算',
    category: 'loan',
    tags: ['LPR', '利率', '基准利率', '公积金'],
    status: 'active',
    kind: 'internal',
    order: 82,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-09'
  },
  component: () => import('./LprRateTool.vue')
}

export default entry
