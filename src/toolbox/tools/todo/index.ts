import type { ToolboxToolEntry } from '../../types'
import { MODULE_CATEGORY_ID } from '../../core/category'

/**
 * 待办清单（站内已有模块）
 * kind: 'module' → 点击走站内路由 /workbench，不在工具箱内重复实现；
 * 分类走专属的「站内模块」（也可省略 category，registry 会自动归一化）。
 */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'todo',
    name: '待办清单',
    icon: '✅',
    description: '个人工作台待办面板（站内模块）',
    category: MODULE_CATEGORY_ID,
    tags: ['待办', '任务'],
    status: 'active',
    kind: 'module',
    url: '/workbench',
    order: 11
  }
}

export default entry
