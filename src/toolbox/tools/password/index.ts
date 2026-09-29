import type { ToolboxToolEntry } from '../../types'
import { MODULE_CATEGORY_ID } from '../../core/category'

/** 密码本（站内已有模块 → /workbench） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'password',
    name: '密码本',
    icon: '🔐',
    description: '加密密码管理（站内模块）',
    category: MODULE_CATEGORY_ID,
    tags: ['密码', '安全'],
    status: 'active',
    kind: 'module',
    url: '/workbench',
    order: 12
  }
}

export default entry
