import type { ToolboxToolEntry } from '../../types'

/** 正则表达式测试（站内自建） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'regex-test',
    name: '正则表达式测试',
    icon: '🔍',
    description: '编写与调试正则表达式，实时查看匹配结果',
    category: 'dev',
    tags: ['正则', 'regex', '调试'],
    status: 'active',
    kind: 'internal',
    order: 3
  },
  component: () => import('./RegexTestTool.vue')
}

export default entry
