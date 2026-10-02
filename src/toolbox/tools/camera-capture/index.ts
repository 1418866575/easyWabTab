import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'camera-capture',
    name: '相机拍照',
    icon: '📷',
    description: '调用设备摄像头实时预览并拍照保存，画面仅在本地处理',
    category: 'device',
    tags: ['相机', '拍照', '摄像头', 'camera'],
    status: 'active',
    kind: 'internal',
    order: 10,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-10-02'
  },
  component: () => import('./CameraCaptureTool.vue')
}

export default entry
