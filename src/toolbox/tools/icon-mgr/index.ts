import type { ToolboxToolEntry } from '../../types'

/** 图标管理（站内已有模块 → 首页导航站 / 设置） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'icon-mgr',
    name: '图标管理',
    icon: '🌟',
    description: '自定义图标的上传与管理（站内模块）',
    category: 'other',
    tags: ['图标'],
    status: 'active',
    kind: 'module',
    url: '/',
    order: 15
  }
}

export default entry
