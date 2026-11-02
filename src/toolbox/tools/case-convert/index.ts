import type { ToolboxToolEntry } from '../../types'

/** 大小写与命名格式转换（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'case-convert',
    name: '大小写与命名转换',
    icon: '🔡',
    description: '驼峰、蛇形、短横线、常量式等 8 种命名格式一键互转，实时联动',
    category: 'text',
    tags: ["大小写", "驼峰", "命名", "变量", "转换"],
    status: 'active',
    kind: 'internal',
    order: 101,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./CaseConvertTool.vue')
}

export default entry
