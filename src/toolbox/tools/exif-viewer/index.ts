import type { ToolboxToolEntry } from '../../types'

/** EXIF 查看与清除（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'exif-viewer',
    name: 'EXIF 查看与清除',
    icon: '📷',
    description: '查看照片元数据并一键清除 GPS、拍摄时间等敏感信息',
    category: 'image',
    tags: ["exif","元数据","隐私"],
    status: 'active',
    kind: 'internal',
    order: 47,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./ExifViewerTool.vue')
}

export default entry
