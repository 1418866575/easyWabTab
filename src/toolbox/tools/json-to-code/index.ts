import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'json-to-code',
    name: 'JSON 转代码模型',
    icon: '🔁',
    description: '从样例 JSON 生成 Java/Python/Go/TypeScript/C#/Rust 数据结构（类、dataclass、struct）',
    category: 'dev',
    tags: ['json', '代码生成', 'model', 'struct'],
    status: 'active',
    kind: 'internal',
    order: 40,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./JsonToCodeTool.vue')
}

export default entry
