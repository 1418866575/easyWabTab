import type { ToolboxToolEntry } from '../../types'

/** 证件照换底（站内自建，纯前端实现，零上传） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'id-photo-bg',
    name: '证件照换底',
    icon: '🪪',
    description: '上传证件照一键换红/蓝/白底，可选规格尺寸并下载到本地，纯前端零上传',
    category: 'image',
    tags: ['证件照', '换底', '红底', '蓝底', '白底', '抠图', 'idphoto'],
    status: 'active',
    kind: 'internal',
    order: 45,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-03'
  },
  component: () => import('./IdPhotoBgTool.vue')
}

export default entry
