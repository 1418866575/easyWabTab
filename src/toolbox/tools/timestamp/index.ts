import type { ToolboxToolEntry } from '../../types'

/** 时间戳转换（站内自建） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'timestamp',
    name: '时间戳转换',
    icon: '🕒',
    description: 'Unix 时间戳与日期互转，支持毫秒精度',
    category: 'dev',
    tags: ['时间戳', '转换'],
    status: 'active',
    kind: 'internal',
    order: 2
  },
  component: () => import('./TimestampTool.vue')
}

export default entry
