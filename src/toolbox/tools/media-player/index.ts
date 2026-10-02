import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'media-player',
    name: '媒体播放器',
    icon: '🎬',
    description: '本地音频/视频文件播放，浏览器原生控件，不上传不联网',
    category: 'media',
    tags: ['音频', '视频', '播放器', '本地', 'mp3', 'mp4', '播放'],
    status: 'active',
    kind: 'internal',
    order: 60,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-03'
  },
  component: () => import('./MediaPlayerTool.vue')
}

export default entry
