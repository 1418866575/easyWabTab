import type { ToolboxToolEntry } from '../../types'

/** 正则表达式测试（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'regex-test',
    name: '正则表达式测试',
    icon: '🔍',
    description: '实时匹配、捕获组分析、替换预览与灾难性回溯防护',
    category: 'dev',
    tags: ["正则","regex","调试"],
    status: 'active',
    kind: 'internal',
    order: 3,
    modalSize: 'L',
    layout: 'T3',
    addedAt: '2026-09-30'
  },
  component: () => import('./RegexTestTool.vue')
}

export default entry
