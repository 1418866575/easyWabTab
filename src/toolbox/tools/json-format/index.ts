import type { ToolboxToolEntry } from '../../types'

/**
 * JSON 格式化（站内自建）
 * 新增工具 = 本目录 index.ts 声明元数据 + 组件，页面无需任何改动。
 */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'json-format',
    name: 'JSON 格式化',
    icon: '🧩',
    description: '格式化、压缩与校验 JSON，站内实现',
    category: 'dev',
    tags: ['json', '格式化', '校验'],
    status: 'active',
    kind: 'internal',
    order: 1
  },
  component: () => import('./JsonFormatTool.vue')
}

export default entry
