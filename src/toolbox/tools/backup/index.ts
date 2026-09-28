import type { ToolboxToolEntry } from '../../types'

/** 备份导入导出（站内已有模块 → 首页导航站 / 设置） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'backup',
    name: '备份导入导出',
    icon: '📦',
    description: '数据备份与恢复（站内模块）',
    category: 'effi',
    tags: ['备份', '恢复'],
    status: 'active',
    kind: 'module',
    url: '/',
    order: 14
  }
}

export default entry
