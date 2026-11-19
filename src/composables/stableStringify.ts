/**
 * 云同步内容签名用的稳定序列化：递归排序对象 key，并对齐 JSON.stringify 的字段语义。
 *
 * 关键：值为 undefined 的对象字段必须**跳过**（数组元素则按 JSON.stringify 变成 null）。
 * 旧实现会把 undefined 写成字面量字符串 `undefined`，而云端 JSON 文件经过 JSON.stringify
 * 后根本没有这些字段 —— 于是「本地导出」与「云端解析结果」签名永远不同，体积也凭空大出一截，
 * 表现为「没改任何东西却反复提示 blog.json 冲突」。
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    const text = JSON.stringify(obj)
    return text === undefined ? 'null' : text
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item === undefined ? null : item)).join(',') + ']'
  }
  const record = obj as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const parts: string[] = []
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') continue
    parts.push(JSON.stringify(key) + ':' + stableStringify(value))
  }
  return '{' + parts.join(',') + '}'
}
