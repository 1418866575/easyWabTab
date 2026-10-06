import type { ToolboxToolEntry } from '../../types'

/** 乘法表（大九九 + 小九九对照，站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'multiplication-table',
    name: '乘法表',
    icon: '✖️',
    description: '大九九乘法表（19×19，361 个算式），小九九区（1–9，45 个）用底色区分，可切换积/算式/口诀，支持导出 Excel 与打印 A4 练习卷',
    category: 'calc',
    tags: ['乘法表', '九九表', '大九九', '小九九', '十九乘十九', '口诀', '练习卷', '口算', '打印', 'Excel', '小学数学'],
    status: 'active',
    kind: 'internal',
    order: 74,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-10-06'
  },
  component: () => import('./MultiplicationTableTool.vue')
}

export default entry