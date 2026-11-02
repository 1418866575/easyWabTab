import type { ToolboxToolEntry } from '../../types'

/** 随机数据生成器（站内自建，占位符模板 + 种子复现，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'mock-data',
    name: '随机数据生成器',
    icon: '🧪',
    description: '用占位符描述数据结构，一键批量生成姓名、邮箱、地址等逼真假数据并导出 JSON',
    category: 'gen',
    tags: ["mock", "假数据", "测试", "占位符", "随机"],
    status: 'active',
    kind: 'internal',
    order: 120,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./MockDataTool.vue')
}

export default entry
