import type { ToolboxToolEntry } from '../../types'

/** 银行卡号生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'bankcard-gen',
    name: '银行卡号生成器',
    icon: '💳',
    description: '按发卡行前缀与位数批量生成银行卡号（Luhn 校验）并支持反向校验',
    category: 'gen',
    tags: ['银行卡', '卡号', 'Luhn', '生成', '校验', '测试数据'],
    status: 'active',
    kind: 'internal',
    order: 88,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./BankcardGenTool.vue')
}

export default entry
