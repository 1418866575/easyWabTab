import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'api-test',
    name: 'API 接口测试',
    icon: '🔌',
    description: '填写方法 / URL / 请求头 / 请求体，发起请求并查看状态码、耗时与响应内容',
    category: 'dev',
    tags: ['api', '请求', 'fetch', 'http', '测试'],
    status: 'active',
    kind: 'internal',
    order: 60,
    modalSize: 'L',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./ApiTestTool.vue')
}

export default entry
