import type { ToolboxToolEntry } from '../../types'

/**
 * 音视频格式转换（维护中）
 * 状态为 maintenance：置灰不可点，修复后改为 active 并补 component 即可。
 */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'media-convert',
    name: '音视频格式转换',
    icon: '🎞️',
    description: '常见音视频格式互转与压缩',
    category: 'media',
    tags: ['音视频', '转换'],
    status: 'maintenance',
    kind: 'internal',
    order: 10
  }
}

export default entry
