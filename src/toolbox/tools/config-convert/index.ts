import type { ToolboxToolEntry } from '../../types'

/** JSON / YAML / TOML 互转（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'config-convert',
    name: 'JSON / YAML / TOML 互转',
    icon: '🔀',
    description: '三种配置格式在线互转，自动检测源格式并校验语法',
    category: 'dev',
    tags: ["yaml","toml","json","配置"],
    status: 'active',
    kind: 'internal',
    order: 2,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-09-30'
  },
  component: () => import('./ConfigConvertTool.vue')
}

export default entry
