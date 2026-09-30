import type { ToolboxToolEntry } from '../../types'

/** 密码生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'password-gen',
    name: '密码生成器',
    icon: '🔐',
    description: '本地生成可配置强度的随机密码，支持自定义字符集与熵值评估',
    category: 'gen',
    tags: ["密码","随机","安全"],
    status: 'active',
    kind: 'internal',
    order: 82,
    modalSize: 'S',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./PasswordGenTool.vue')
}

export default entry
