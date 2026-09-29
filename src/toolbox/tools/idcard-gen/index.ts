import type { ToolboxToolEntry } from '../../types'

/** 身份证号生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'idcard-gen',
    name: '身份证号生成器',
    icon: '🪪',
    description: '按地区 / 性别 / 年龄段批量生成 18 位身份证号，并支持 ISO 7064 Mod 11,2 反向校验',
    category: 'gen',
    tags: ['身份证', '身份证号', '号码', '生成', '校验', '测试数据'],
    status: 'active',
    kind: 'internal',
    order: 85,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./IdcardGenTool.vue')
}

export default entry
