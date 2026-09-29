import type { ToolboxToolEntry } from '../../types'

/** UUID / ID 生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'uuid-gen',
    name: 'UUID / ID 生成器',
    icon: '🆔',
    description: '批量生成 UUID v4/v7、NanoID、ULID、ObjectId 与短 ID',
    category: 'gen',
    tags: ["uuid","nanoid","ulid"],
    status: 'active',
    kind: 'internal',
    order: 81,
    modalSize: 'S',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./UuidGenTool.vue')
}

export default entry
