import type { ToolboxToolEntry } from '../../types'

/** 磁盘清理（站内自建，基于 File System Access API，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'disk-cleaner',
    name: '磁盘清理',
    icon: '🧹',
    description: '选择目录扫描大文件（视频/压缩包/安装包/图片/音频等），按大小排序并可永久删除',
    category: 'effi',
    tags: ['磁盘', '清理', '大文件', '扫描', '删除', '视频', '压缩包', '安装包', '空间'],
    status: 'active',
    kind: 'internal',
    order: 94,
    modalSize: 'XL',
    layout: 'T6',
    addedAt: '2026-10-16'
  },
  component: () => import('./DiskCleanerTool.vue')
}

export default entry
