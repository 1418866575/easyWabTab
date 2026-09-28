import type { ToolboxToolEntry } from '../../types'
import { MODULE_CATEGORY_ID } from '../../core/category'

/** 使用帮助（站内已有模块 → 首页导航站） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'help',
    name: '使用帮助',
    icon: '❓',
    description: '查看快捷键与各模块功能说明（站内模块）',
    category: MODULE_CATEGORY_ID,
    tags: ['帮助', '文档'],
    status: 'active',
    kind: 'module',
    url: '/',
    order: 16
  }
}

export default entry
