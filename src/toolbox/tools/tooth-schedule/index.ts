import type { ToolboxToolEntry } from '../../types'

/** 儿童换牙时间表（站内自建，纯前端参考表） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'tooth-schedule',
    name: '儿童换牙时间表',
    icon: '🦷',
    description: '儿童乳牙替换与恒牙萌出时间表，含牙齿位置图与六龄齿科普',
    category: 'calc',
    tags: ['儿童', '牙齿', '换牙', '六龄齿', '恒牙', '乳牙', '发育', '健康'],
    status: 'active',
    kind: 'internal',
    order: 76,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-10-15'
  },
  component: () => import('./ToothScheduleTool.vue')
}

export default entry
