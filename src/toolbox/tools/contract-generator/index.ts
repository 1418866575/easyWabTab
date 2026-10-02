import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'contract-generator',
    name: '合同模板生成器',
    icon: '📄',
    description: '选择常用合同模板，填入关键字段即可生成可复制下载的合同草稿（借款/租赁/劳务/保密）',
    category: 'doc',
    tags: ['合同', '模板', '借款', '租赁', '劳务', '保密协议', 'nda'],
    status: 'active',
    kind: 'internal',
    order: 50,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./ContractGeneratorTool.vue')
}

export default entry
