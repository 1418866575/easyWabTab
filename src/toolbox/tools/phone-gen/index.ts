import type { ToolboxToolEntry } from '../../types'

/** 手机号生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'phone-gen',
    name: '手机号生成器',
    icon: '📱',
    description: '按在用运营商号段批量生成 11 位手机号，并支持号段校验',
    category: 'gen',
    tags: ['手机号', '电话', '号段', '生成', '校验', '测试数据'],
    status: 'active',
    kind: 'internal',
    order: 89,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./PhoneGenTool.vue')
}

export default entry
