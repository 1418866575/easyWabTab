import type { ToolboxToolEntry } from '../../types'

/** IMEI 校验与生成（站内自建，Luhn 本地计算，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'imei-tool',
    name: 'IMEI 校验生成',
    icon: '📱',
    description: 'Luhn 校验 IMEI / IMEISV、14 位补全校验位、拆解 TAC 结构并批量生成测试号',
    category: 'gen',
    tags: ["IMEI", "串号", "Luhn", "校验", "生成"],
    status: 'active',
    kind: 'internal',
    order: 117,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./ImeiTool.vue')
}

export default entry
