import type { ToolboxToolEntry } from '../../types'

/** 进制转换（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'base-convert',
    name: '进制转换',
    icon: '🔢',
    description: '2–36 进制互转，BigInt 保证大数精度，支持分组与多进制一览',
    category: 'dev',
    tags: ["进制","二进制","十六进制"],
    status: 'active',
    kind: 'internal',
    order: 6,
    modalSize: 'S',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./BaseConvertTool.vue')
}

export default entry
