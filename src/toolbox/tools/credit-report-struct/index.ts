import type { ToolboxToolEntry } from '../../types'

/** 企业征信报文结构说明（站内自建，二代 V5.0 层级化视图 + 字段级说明 + 业务域/关键字/必填筛选） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'credit-report-struct',
    name: '企业征信报文结构说明',
    icon: '📑',
    description: '二代企业征信报文结构：数据块→信息单元→信息段→数据项四层视图，字段级名称/标识/类型/长度/必填/约束，按业务域与关键字筛选',
    category: 'calc',
    tags: ['企业征信', '征信报文', '报文结构', '数据块', '信息单元', '信息段', '数据项', '二代征信', '准入'],
    status: 'active',
    kind: 'internal',
    order: 93,
    modalSize: 'XL',
    layout: 'T4',
    addedAt: '2026-10-10'
  },
  component: () => import('./CreditReportStructTool.vue')
}

export default entry
