/**
 * HTTP 状态码内置数据（1xx–5xx 常用码，随包体打包，无网络请求）
 */

export type StatusCat = '1xx' | '2xx' | '3xx' | '4xx' | '5xx'

export interface HttpStatusItem {
  code: number
  phrase: string
  cn: string
  scene: string
  cat: StatusCat
}

export const HTTP_STATUS: HttpStatusItem[] = [
  { code: 100, phrase: 'Continue', cn: '继续', scene: '客户端发送 Expect: 100-continue 时，服务器确认可以继续发送请求体', cat: '1xx' },
  { code: 101, phrase: 'Switching Protocols', cn: '切换协议', scene: 'WebSocket 握手时从 HTTP 切换到 ws 协议', cat: '1xx' },
  { code: 102, phrase: 'Processing', cn: '处理中', scene: 'WebDAV 请求耗时较长，服务器告知仍在处理', cat: '1xx' },
  { code: 103, phrase: 'Early Hints', cn: '早期提示', scene: '在最终响应前提示浏览器预加载 CSS / JS', cat: '1xx' },

  { code: 200, phrase: 'OK', cn: '成功', scene: '最常见的成功响应', cat: '2xx' },
  { code: 201, phrase: 'Created', cn: '已创建', scene: 'POST 创建资源成功，通常带 Location 头', cat: '2xx' },
  { code: 202, phrase: 'Accepted', cn: '已接受', scene: '异步任务已入队，尚未处理完成', cat: '2xx' },
  { code: 203, phrase: 'Non-Authoritative Information', cn: '非权威信息', scene: '返回的是代理或缓存的副本', cat: '2xx' },
  { code: 204, phrase: 'No Content', cn: '无内容', scene: '成功但无响应体，常用于 DELETE 成功或保存心跳', cat: '2xx' },
  { code: 205, phrase: 'Reset Content', cn: '重置内容', scene: '要求客户端重置表单', cat: '2xx' },
  { code: 206, phrase: 'Partial Content', cn: '部分内容', scene: 'Range 请求（视频拖动、断点续传）返回片段', cat: '2xx' },
  { code: 207, phrase: 'Multi-Status', cn: '多状态', scene: 'WebDAV 批量操作的逐项结果', cat: '2xx' },
  { code: 208, phrase: 'Already Reported', cn: '已报告', scene: 'WebDAV 绑定成员避免重复列举', cat: '2xx' },
  { code: 226, phrase: 'IM Used', cn: '已使用增量', scene: 'Delta 编码返回差异部分', cat: '2xx' },

  { code: 300, phrase: 'Multiple Choices', cn: '多种选择', scene: '资源有多个表示，由客户端选择', cat: '3xx' },
  { code: 301, phrase: 'Moved Permanently', cn: '永久重定向', scene: '域名更换、http→https；搜索引擎会更新索引', cat: '3xx' },
  { code: 302, phrase: 'Found', cn: '临时重定向', scene: '登录后跳转；浏览器一般改用 GET', cat: '3xx' },
  { code: 303, phrase: 'See Other', cn: '查看其他位置', scene: '表单提交后重定向到结果页（PRG 模式）', cat: '3xx' },
  { code: 304, phrase: 'Not Modified', cn: '未修改', scene: '协商缓存命中（If-None-Match / If-Modified-Since）', cat: '3xx' },
  { code: 307, phrase: 'Temporary Redirect', cn: '临时重定向', scene: '临时跳转且保持原请求方法', cat: '3xx' },
  { code: 308, phrase: 'Permanent Redirect', cn: '永久重定向', scene: '永久跳转且保持原请求方法', cat: '3xx' },

  { code: 400, phrase: 'Bad Request', cn: '请求错误', scene: '参数格式错误、JSON 解析失败', cat: '4xx' },
  { code: 401, phrase: 'Unauthorized', cn: '未认证', scene: '未登录或 token 失效，需携带凭据重新请求', cat: '4xx' },
  { code: 402, phrase: 'Payment Required', cn: '需要付款', scene: '预留码，个别付费 API 用作配额限制', cat: '4xx' },
  { code: 403, phrase: 'Forbidden', cn: '禁止访问', scene: '已认证但无权限；nginx 静态目录缺索引时也会返回', cat: '4xx' },
  { code: 404, phrase: 'Not Found', cn: '未找到', scene: '资源不存在或路由未匹配', cat: '4xx' },
  { code: 405, phrase: 'Method Not Allowed', cn: '方法不允许', scene: '对静态 location 发 POST 常见此错误', cat: '4xx' },
  { code: 406, phrase: 'Not Acceptable', cn: '不可接受', scene: 'Accept 头与服务端能提供的内容不匹配', cat: '4xx' },
  { code: 407, phrase: 'Proxy Authentication Required', cn: '需要代理认证', scene: '代理服务器要求提供凭据', cat: '4xx' },
  { code: 408, phrase: 'Request Timeout', cn: '请求超时', scene: '客户端发送请求体过慢，服务器超时关闭连接', cat: '4xx' },
  { code: 409, phrase: 'Conflict', cn: '冲突', scene: '并发修改同一资源、唯一键重复', cat: '4xx' },
  { code: 410, phrase: 'Gone', cn: '已删除', scene: '资源永久下线，比 404 更明确', cat: '4xx' },
  { code: 411, phrase: 'Length Required', cn: '需要 Content-Length', scene: '服务器要求明确请求体长度', cat: '4xx' },
  { code: 412, phrase: 'Precondition Failed', cn: '前置条件失败', scene: 'If-Match 等条件头不满足，乐观锁场景', cat: '4xx' },
  { code: 413, phrase: 'Payload Too Large', cn: '请求体过大', scene: '上传文件超过 nginx client_max_body_size', cat: '4xx' },
  { code: 414, phrase: 'URI Too Long', cn: 'URI 过长', scene: 'GET 参数过多，应改 POST', cat: '4xx' },
  { code: 415, phrase: 'Unsupported Media Type', cn: '不支持的媒体类型', scene: 'Content-Type 与接口要求不符', cat: '4xx' },
  { code: 416, phrase: 'Range Not Satisfiable', cn: '范围无法满足', scene: '请求的字节区间超出文件大小', cat: '4xx' },
  { code: 417, phrase: 'Expectation Failed', cn: '期望失败', scene: 'Expect 头要求无法满足', cat: '4xx' },
  { code: 418, phrase: "I'm a teapot", cn: '我是茶壶', scene: '彩蛋状态码，表示拒绝泡咖啡', cat: '4xx' },
  { code: 421, phrase: 'Misdirected Request', cn: '错误定向的请求', scene: '请求被发到无法响应的服务器（复用连接）', cat: '4xx' },
  { code: 422, phrase: 'Unprocessable Content', cn: '无法处理的内容', scene: '语法正确但语义校验失败（表单校验）', cat: '4xx' },
  { code: 423, phrase: 'Locked', cn: '已锁定', scene: 'WebDAV 资源被锁定', cat: '4xx' },
  { code: 424, phrase: 'Failed Dependency', cn: '依赖失败', scene: '前置请求失败导致本请求无法执行', cat: '4xx' },
  { code: 425, phrase: 'Too Early', cn: '过早', scene: '服务器拒绝处理可能重放的请求', cat: '4xx' },
  { code: 426, phrase: 'Upgrade Required', cn: '需要升级协议', scene: '要求客户端切换到 TLS / WebSocket', cat: '4xx' },
  { code: 428, phrase: 'Precondition Required', cn: '需要前置条件', scene: '要求带 If-Match 防止丢失更新', cat: '4xx' },
  { code: 429, phrase: 'Too Many Requests', cn: '请求过多', scene: '触发限流，配合 Retry-After 使用', cat: '4xx' },
  { code: 431, phrase: 'Request Header Fields Too Large', cn: '请求头过大', scene: 'Cookie / Token 过长', cat: '4xx' },
  { code: 451, phrase: 'Unavailable For Legal Reasons', cn: '因法律原因不可用', scene: '合规要求下线的内容', cat: '4xx' },

  { code: 500, phrase: 'Internal Server Error', cn: '服务器内部错误', scene: '未捕获异常，最常排查的 5xx', cat: '5xx' },
  { code: 501, phrase: 'Not Implemented', cn: '未实现', scene: '服务器不支持该请求方法', cat: '5xx' },
  { code: 502, phrase: 'Bad Gateway', cn: '网关错误', scene: '反代后面的服务挂了或端口不通', cat: '5xx' },
  { code: 503, phrase: 'Service Unavailable', cn: '服务不可用', scene: '服务重启 / 过载维护中', cat: '5xx' },
  { code: 504, phrase: 'Gateway Timeout', cn: '网关超时', scene: '上游响应超时，需调 proxy_read_timeout', cat: '5xx' },
  { code: 505, phrase: 'HTTP Version Not Supported', cn: '不支持该 HTTP 版本', scene: '服务器不支持请求的协议版本', cat: '5xx' },
  { code: 506, phrase: 'Variant Also Negotiates', cn: '变体也在协商', scene: '内容协商配置错误', cat: '5xx' },
  { code: 507, phrase: 'Insufficient Storage', cn: '存储不足', scene: 'WebDAV 服务器空间不够', cat: '5xx' },
  { code: 508, phrase: 'Loop Detected', cn: '检测到循环', scene: 'WebDAV 操作出现无限循环', cat: '5xx' },
  { code: 510, phrase: 'Not Extended', cn: '未扩展', scene: '请求需要服务器不支持的扩展', cat: '5xx' },
  { code: 511, phrase: 'Network Authentication Required', cn: '需要网络认证', scene: ' captive portal（酒店 / 机场 WiFi 登录页）', cat: '5xx' }
]

export const CATS: { id: StatusCat; name: string }[] = [
  { id: '1xx', name: '1xx 信息' },
  { id: '2xx', name: '2xx 成功' },
  { id: '3xx', name: '3xx 重定向' },
  { id: '4xx', name: '4xx 客户端错误' },
  { id: '5xx', name: '5xx 服务器错误' }
]

export function searchStatus(q: string, cat: StatusCat | 'all'): HttpStatusItem[] {
  const k = (q ?? '').trim().toLowerCase()
  return HTTP_STATUS.filter((s) => {
    if (cat !== 'all' && s.cat !== cat) return false
    if (!k) return true
    return String(s.code).includes(k) || s.phrase.toLowerCase().includes(k) || s.cn.includes(k) || s.scene.toLowerCase().includes(k)
  })
}

export function statusColor(cat: StatusCat): string {
  if (cat === '2xx') return 'ok'
  if (cat === '3xx') return 'info'
  if (cat === '1xx') return 'info'
  return 'err'
}
