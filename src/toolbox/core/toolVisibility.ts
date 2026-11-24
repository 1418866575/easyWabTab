/**
 * 工具箱「工具开关」纯逻辑
 *
 * 语义：开启/关闭**只影响工具是否在列表中展示**，不删除工具本身的数据
 * （实现组件、收藏、点击次数、最近使用记录一律保留）。
 *
 * 存储形态：`disabled: string[]`（**只存被关闭的 id**）。
 * 选这个方向而不是 `enabled: string[]`，原因：
 *   1. 默认全部开启 → 空数组即默认态，新用户/云同步无该字段时天然正确，无需迁移
 *   2. 新增工具自动可见（不会被"白名单里没有它"误伤成关闭）
 *   3. 数据量与「关闭了几个」成正比，通常远小于开启数
 *
 * 零 vue / 零 pinia 依赖，可被 `node --experimental-strip-types` 直测。
 */

/** 规范化关闭列表：去空、去重、只保留字符串；任何脏输入 → []（= 全部开启） */
export function normalizeDisabled(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const s = x.trim()
    if (!s || out.includes(s)) continue
    out.push(s)
  }
  return out
}

/** 判断某工具是否开启（不在关闭列表里即开启） */
export function isToolEnabled(disabled: readonly string[], id: string): boolean {
  return !disabled.includes(id)
}

/**
 * 切换某工具的开关，返回新的关闭列表（不改入参）。
 * 返回 `{ ok, reason }` 与项目其它核心函数保持同构，便于组件层统一处理。
 */
export function toggleToolDisabled(
  disabled: readonly string[],
  id: string,
  enabled: boolean
): { ok: true; disabled: string[] } | { ok: false; reason: 'invalid-id' } {
  if (typeof id !== 'string' || !id.trim()) return { ok: false, reason: 'invalid-id' }
  const cur = normalizeDisabled(disabled)
  const has = cur.includes(id)

  if (enabled) {
    // 开启 = 从关闭列表移除
    if (!has) return { ok: true, disabled: cur }
    return { ok: true, disabled: cur.filter((x) => x !== id) }
  }
  // 关闭 = 加入关闭列表（已存在则原样返回，保证幂等）
  if (has) return { ok: true, disabled: cur }
  return { ok: true, disabled: [...cur, id] }
}

/** 一键全部开启 */
export function enableAllTools(): string[] {
  return []
}

/**
 * 一键全部关闭：需要已知的全部 id。
 * 空数组入参 → 空结果（不会有"关闭了 0 个"的诡异状态）。
 */
export function disableAllTools(allIds: readonly string[]): string[] {
  return normalizeDisabled([...allIds])
}

/**
 * 从工具列表中剔除被关闭的项。
 * 纯函数、返回新数组、保持原顺序（顺序由上层 sort 决定，本函数不动）。
 */
export function filterEnabledTools<T extends { id: string }>(
  tools: readonly T[],
  disabled: readonly string[]
): T[] {
  const off = new Set(normalizeDisabled(disabled))
  if (!off.size) return [...tools]
  return tools.filter((t) => !off.has(t.id))
}

/**
 * 清理关闭列表中「已不存在的工具 id」（工具目录被删掉后留下的脏数据）。
 * 返回新数组；无变化时返回内容相同的新数组（幂等）。
 */
export function pruneDisabled(disabled: readonly string[], allIds: readonly string[]): string[] {
  const alive = new Set(allIds)
  return normalizeDisabled(disabled).filter((id) => alive.has(id))
}
