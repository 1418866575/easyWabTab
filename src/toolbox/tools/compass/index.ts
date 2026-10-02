import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'compass',
    name: '电子指南针',
    icon: '🧭',
    description: '读取设备方向传感器显示朝向角度，桌面端通常无传感器',
    category: 'device',
    tags: ['指南针', '方向', '传感器', 'compass'],
    status: 'active',
    kind: 'internal',
    order: 11,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./CompassTool.vue')
}

export default entry
