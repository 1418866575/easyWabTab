import type { ToolboxToolEntry } from '../../types'

/** 号码生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'number-gen',
    name: '号码生成器',
    icon: '🔢',
    description: '生成并校验身份证、组织机构代码、统一社会信用代码、银行卡、手机号、邮箱与 IP',
    category: 'gen',
    tags: ['号码', '身份证', '统一社会信用代码', '银行卡', '手机号', '测试数据', '校验'],
    status: 'active',
    kind: 'internal',
    order: 85,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./NumberGenTool.vue')
}

export default entry
