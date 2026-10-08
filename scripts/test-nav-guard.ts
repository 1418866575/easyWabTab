/**
 * 导航数据降级防护单测（navDataGuard / navShadow）
 *
 * 覆盖 2026-10-07「移动端导航数据被清空 → 写回 → 推送上云 → 电脑端连锁丢失」事故的三层修复判据：
 *   - navDataGuard：站点数解析、骤降判定、基线读写（localStorage）、远端疑似清空判定
 *   - navShadow：localStorage 影子副本的写入/读取/跳过超大值/清空
 *
 * 运行：node --experimental-strip-types scripts/test-nav-guard.ts
 *
 * 说明：node 默认没有 localStorage，这里在调用前给 globalThis 挂一个内存实现。
 * 两个模块的存储访问都是**惰性**的（每次调用时 typeof localStorage 判断），因此可以正常测试。
 */
import assert from 'node:assert/strict'

// ---------- 内存版 localStorage ----------
const memMap = new Map<string, string>()
const memoryStorage = {
  get length() {
    return memMap.size
  },
  clear: () => memMap.clear(),
  getItem: (k: string): string | null => (memMap.has(k) ? (memMap.get(k) as string) : null),
  key: (i: number): string | null => Array.from(memMap.keys())[i] ?? null,
  removeItem: (k: string): void => {
    memMap.delete(k)
  },
  setItem: (k: string, v: string): void => {
    memMap.set(k, String(v))
  }
} as unknown as Storage
;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage

// 必须在挂上 localStorage 之后再 import（虽然模块访问是惰性的，这里保证语义清晰）
// 注意：v20 起基线的持久化已迁至 navMeta（IndexedDB `navmeta`），
// 本文件只断言「纯判据 + 会话标志」，不再触碰任何存储介质。
// 基线相关的持久化用例见 scripts/test-nav-meta.ts。
const {
  GUARD_MIN_BASELINE,
  GUARD_DROP_RATIO,
  UNKNOWN_COUNT,
  parseUserSitesCount,
  shouldGuardDrop,
  evaluateUserSitesCount,
  isSuspectedRemoteWipe,
  isSuspectedWipe,
  checkUserSitesAgainstBaseline,
  armNavWipeOverride,
  isNavWipeOverrideActive,
  armNavExplicitMutation,
  isNavExplicitMutationActive,
  resetNavSessionFlags
} = await import('../src/composables/navDataGuard.ts')
const {
  NAV_SHADOW_KEYS,
  SHADOW_PREFIX,
  SHADOW_MAX_VALUE_LEN,
  SHADOW_STAMP_KEY,
  readShadow,
  writeShadow,
  clearShadow,
  shadowStamp
} = await import('../src/composables/navShadow.ts')

const tests: { name: string; fn: () => void | Promise<void> }[] = []
function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn })
}
function resetStorage(): void {
  memMap.clear()
}

// ===== navDataGuard：纯函数判据 =====

test('NG-01 parseUserSitesCount 边界：缺失/空串=0，数组=长度', () => {
  assert.equal(parseUserSitesCount(null), 0)
  assert.equal(parseUserSitesCount(undefined), 0)
  assert.equal(parseUserSitesCount(''), 0)
  assert.equal(parseUserSitesCount('[]'), 0, '空数组应识别为 0 条')
  assert.equal(parseUserSitesCount('[{"url":"a"}]'), 1)
  assert.equal(parseUserSitesCount(JSON.stringify(new Array(100).fill({ url: 'x' }))), 100)
})

test('NG-02 parseUserSitesCount 损坏内容=UNKNOWN_COUNT（不误判为 0）', () => {
  assert.equal(parseUserSitesCount('{oops'), UNKNOWN_COUNT)
  assert.equal(parseUserSitesCount('{"a":1}'), UNKNOWN_COUNT, '非数组的合法 JSON 也算无法判定')
})

test('NG-03 shouldGuardDrop：基线过小/数量未知一律不拦', () => {
  assert.equal(shouldGuardDrop(0, 0), false, '没有基线不拦')
  assert.equal(shouldGuardDrop(0, GUARD_MIN_BASELINE - 1), false, '基线低于阈值不拦')
  assert.equal(shouldGuardDrop(UNKNOWN_COUNT, 100), false, '数量未知不拦')
})

test('NG-04 shouldGuardDrop：骤降触发、正常波动不触发', () => {
  assert.equal(shouldGuardDrop(100, 100), false)
  assert.equal(shouldGuardDrop(50, 100), false, '刚好卡在阈值线上（< 才触发）')
  assert.equal(shouldGuardDrop(49, 100), true, '低于基线一半应触发')
  assert.equal(shouldGuardDrop(0, 100), true, '清空必须触发')
  assert.equal(shouldGuardDrop(0, GUARD_MIN_BASELINE), true)
})

test('NG-05 evaluateUserSitesCount 原因文案只在触发时非空', () => {
  const ok = evaluateUserSitesCount(80, 100)
  assert.equal(ok.tripped, false)
  assert.equal(ok.reason, '')
  assert.equal(ok.current, 80)
  assert.equal(ok.baseline, 100)

  const bad = evaluateUserSitesCount(2, 80)
  assert.equal(bad.tripped, true)
  assert.ok(bad.reason.includes('80'), '原因里应带上基线值')
  assert.ok(bad.reason.includes('50%'), '原因里应带上比例说明')
  assert.equal(GUARD_DROP_RATIO, 0.5)
})

// ===== navDataGuard：组合判据（基线由调用方显式传入）=====

test('NG-10 checkUserSitesAgainstBaseline 端到端', () => {
  const sites60 = JSON.stringify(new Array(60).fill({}))
  assert.equal(checkUserSitesAgainstBaseline(sites60, 60).tripped, false)
  assert.equal(checkUserSitesAgainstBaseline('[]', 60).tripped, true, '空列表 vs 有基线 → 触发')
  assert.equal(checkUserSitesAgainstBaseline(null, 60).tripped, true, '键缺失 → 视为 0 条 → 触发')
  assert.equal(checkUserSitesAgainstBaseline('{broken', 60).tripped, false, '损坏 → 数量未知 → 不拦')
  assert.equal(checkUserSitesAgainstBaseline('[]', 0).tripped, false, '没有基线时不拦')
})

test('NG-11 用户逐条删站点不会被自己的基线拦住（这是基线的核心语义）', () => {
  // 用户真删：每次删除都同步基线 → 判定始终不触发
  let baseline = 100
  for (let i = 0; i < 95; i++) {
    baseline -= 1
    assert.equal(shouldGuardDrop(baseline, baseline), false, `第 ${i + 1} 次删除不应触发保护`)
  }
  assert.equal(baseline, 5)
})

/**
 * v20 新增的兜底判据：基线可能因先前几次写入已同步变小（单看它未必触发骤降），
 * 而「当前规模 vs 历史最大规模」几乎只在数据丢失时才成立。
 */
test('NG-12 isSuspectedWipe：高水位兜底判定', () => {
  assert.equal(isSuspectedWipe(0, 200), true, '清空必须触发')
  assert.equal(isSuspectedWipe(50, 200), true, '远低于历史最高 → 触发')
  assert.equal(isSuspectedWipe(120, 200), false, '未跌破一半 → 放行')
  assert.equal(isSuspectedWipe(100, 200), false, '刚好卡在阈值线上（< 才触发）')
  assert.equal(isSuspectedWipe(0, GUARD_MIN_BASELINE - 1), false, '历史规模太小不值得拦')
  assert.equal(isSuspectedWipe(UNKNOWN_COUNT, 200), false, '数量未知不拦')
  assert.equal(isSuspectedWipe(0, 0), false, '没有高水位不拦')
})

test('NG-13 高水位能覆盖「基线已同步变小」这一基线盲区', () => {
  // 事故形态：nav 记录先被残缺内容覆盖，随后几次写入把基线也拉到了 3，
  // 单看基线（3 vs 3）不触发；但历史最高 200 条，一眼可辨是数据丢了。
  const baseline = 3
  const highWater = 200
  assert.equal(shouldGuardDrop(3, baseline), false, '基线盲区：单看基线不触发')
  assert.equal(isSuspectedWipe(3, highWater), true, '高水位必须能兜住')
})

// ===== navDataGuard：远端疑似清空判定 =====

test('NG-20 isSuspectedRemoteWipe 只拦「对方全空而本地成规模」', () => {
  const local = JSON.stringify(new Array(20).fill({}))
  assert.equal(isSuspectedRemoteWipe(local, '[]'), true, '远端空 vs 本地 20 条 → 拦')
  assert.equal(isSuspectedRemoteWipe(local, null), true, '远端缺值等价于空 → 拦')
  assert.equal(isSuspectedRemoteWipe(local, '[{"url":"a"}]'), false, '远端非空即使更少也放行')
  assert.equal(isSuspectedRemoteWipe(local, '{broken'), false, '数量未知不拦')
  assert.equal(isSuspectedRemoteWipe('[]', '[]'), false, '本地本来就没数据 → 不拦')
  assert.equal(
    isSuspectedRemoteWipe(JSON.stringify(new Array(GUARD_MIN_BASELINE - 1).fill({})), '[]'),
    false,
    '本地数据量太小不值得拦'
  )
})

test('NG-21 显式放行开关：默认关闭，武装后限时生效', () => {
  assert.equal(isNavWipeOverrideActive(), false, '默认必须关闭——自动同步链路永远不放行')
  armNavWipeOverride(0)
  assert.equal(isNavWipeOverrideActive(), false, 'ttl=0 视为立即失效')
  armNavWipeOverride(30_000)
  assert.equal(isNavWipeOverrideActive(), true, '冲突解决/备份恢复期间应放行')
  armNavWipeOverride(-1)
  assert.equal(isNavWipeOverrideActive(), false, '负数 ttl 不应把开关永久打开')
})

test('NG-22 显式改动标志：写盘守卫与推送守卫必须读同一份状态（否则会死锁）', () => {
  resetNavSessionFlags()
  assert.equal(isNavExplicitMutationActive(), false, '会话开始时应严格防护')
  armNavExplicitMutation()
  assert.equal(isNavExplicitMutationActive(), true)
  // 用户在 UI 上改过站点后，两道守卫都会放行——这是刻意的，
  // 否则会出现 sites.ts 写进去了、pushNow 却永远拦下的死锁
  resetNavSessionFlags()
  assert.equal(isNavExplicitMutationActive(), false)
})

// ===== navShadow：localStorage 影子副本 =====

test('NS-01 writeShadow/readShadow 往返一致', () => {
  resetStorage()
  writeShadow({ 'user-sites': '[{"url":"a"}]', 'user-theme': 'dark', 'site-title': '我的导航' })
  const shadow = readShadow()
  assert.equal(shadow['user-sites'], '[{"url":"a"}]')
  assert.equal(shadow['user-theme'], 'dark')
  assert.equal(shadow['site-title'], '我的导航')
  assert.ok(shadowStamp() > 0, '写入后应有时间戳')
  assert.ok(memMap.has(SHADOW_STAMP_KEY))
})

test('NS-02 值不变时不重复写（避免每次落盘都刷 localStorage）', () => {
  resetStorage()
  writeShadow({ 'user-sites': '[1]' })
  const key = SHADOW_PREFIX + 'user-sites'
  memMap.set(key, 'sentinel') // 人为改成别的值，若再写会被覆盖说明没走短路分支
  writeShadow({ 'user-sites': 'sentinel' })
  assert.equal(memMap.get(key), 'sentinel')
  // 换成不同值 + 一个 getItem 探针：验证「相同值不触发 setItem」
  let writes = 0
  const realSet = memMap.set.bind(memMap)
  ;(memMap as unknown as { set: typeof realSet }).set = (k: string, v: string) => {
    if (k === key) writes++
    return realSet(k, v)
  }
  writeShadow({ 'user-sites': 'sentinel' })
  assert.equal(writes, 0, '值相同不应再次写入')
  writeShadow({ 'user-sites': '[2]' })
  assert.equal(writes, 1, '值变化应写入一次')
  ;(memMap as unknown as { set: typeof realSet }).set = realSet
})

test('NS-03 超大值与空值不入影子', () => {
  resetStorage()
  const huge = 'x'.repeat(SHADOW_MAX_VALUE_LEN + 1)
  writeShadow({ 'user-sites': huge, 'user-theme': '' })
  assert.equal(readShadow()['user-sites'], undefined, '超大值应跳过（避免挤爆配额）')
  assert.equal(readShadow()['user-theme'], undefined, '空值不应留下脏影子')
  // 恰好等于上限仍可写入
  const edge = 'y'.repeat(SHADOW_MAX_VALUE_LEN)
  writeShadow({ 'user-sites': edge })
  assert.equal(readShadow()['user-sites'], edge, '恰好等于上限的值应保留')
})

/**
 * v20 修正：旧版遇到超过 SHADOW_MAX_VALUE_LEN 的值会 removeItem 把**已有影子删掉**，
 * 于是 user-sites 一旦因 base64 图标超限，影子直接归零 ——
 * IDB 出事时恰恰最需要影子，却没了，等于备份形同虚设。
 * 现在改为先写去图标降级版，实在放不下也保留旧影子，绝不主动删除。
 */
test('NS-05 超限 user-sites 写去图标降级版，绝不删除已有影子', () => {
  resetStorage()
  const icon = 'data:image/png;base64,' + 'A'.repeat(9 * 1024)
  const sites = Array.from({ length: 120 }, (_, i) => ({
    url: `https://e${i}.com`,
    name: `站点${i}`,
    icon
  }))
  const raw = JSON.stringify(sites)
  assert.ok(raw.length > SHADOW_MAX_VALUE_LEN, '前置条件：带图标的站点列表应超过上限')

  writeShadow({ 'user-sites': raw })
  const shadow = readShadow()['user-sites']
  assert.ok(shadow, '超限也必须留下影子，不能删')
  assert.ok(shadow!.length <= SHADOW_MAX_VALUE_LEN, '降级后应落回容量内')

  const restored = JSON.parse(shadow!) as { url: string; icon: string }[]
  assert.equal(restored.length, 120, '站点一条都不能少（图标丢了可重新抓取）')
  assert.equal(restored[0].url, 'https://e0.com')
  assert.equal(restored[0].icon, '', 'base64 图标应被剔除')
})

test('NS-06 降级版也放不下时，保留已有旧影子而非删除', () => {
  resetStorage()
  // 先影一份小的
  writeShadow({ 'user-sites': JSON.stringify([{ url: 'https://old.com' }]) })
  const before = readShadow()['user-sites']
  assert.ok(before)

  // 再来一份「站点本身就超过上限、去图标后仍超限」的极端数据
  const huge = JSON.stringify(
    Array.from({ length: 300 }, (_, i) => ({ url: `https://e${i}.com`, name: 'x'.repeat(3000) }))
  )
  writeShadow({ 'user-sites': huge })
  assert.equal(
    readShadow()['user-sites'],
    before,
    '放不下时应原样保留旧影子 —— 一份稍旧的备份永远好过没有备份'
  )
})

test('NS-04 影子不含图片/缓存类键，clearShadow 清干净', () => {
  resetStorage()
  writeShadow({
    'user-sites': '[1]',
    'site-favicon': 'data:image/png;base64,AAA',
    'user-background': 'data:image/png;base64,BBB',
    'icon-cache': '{"k":1}',
    'site-click-counts': '{"a":1}'
  })
  const shadow = readShadow()
  assert.deepEqual(Object.keys(shadow).sort(), ['user-sites'])
  for (const k of NAV_SHADOW_KEYS) {
    assert.ok(k !== 'icon-cache' && k !== 'site-click-counts', `${k} 不应进影子`)
    assert.ok(k !== 'user-background' && k !== 'site-favicon', `${k} 不应进影子（多为大体积 dataURL）`)
  }
  clearShadow()
  assert.deepEqual(readShadow(), {})
  assert.equal(shadowStamp(), 0)
})

// ===== 回归：事故链条的端到端判据 =====

test('RG-01 事故重演：站点从 80 变成 0 → 写盘应被拦下', () => {
  // 降级后自动写盘路径（点击计数、pagehide flush）拿到的就是这份空态
  const degraded = checkUserSitesAgainstBaseline('[]', 80)
  assert.equal(degraded.tripped, true)
  assert.ok(degraded.reason.includes('80'))
  // 且此时不可写回 → NavSync 的 guardLocal 也会拦下推送
  const navLike = { prefs: { 'user-sites': '[]' } }
  const reason = checkUserSitesAgainstBaseline(navLike.prefs['user-sites'], 80)
  assert.equal(reason.tripped, true, '推送同样应被拦下')
})

test('RG-02 恢复后自动解锁（这是实时判定而非一次性上锁的意义）', () => {
  assert.equal(checkUserSitesAgainstBaseline('[]', 80).tripped, true)
  // 云同步拉取回来 80 条
  assert.equal(checkUserSitesAgainstBaseline(JSON.stringify(new Array(80).fill({})), 80).tripped, false)
})

/**
 * v20 事故重演：基线因 localStorage 被回收而归零。
 * 这是 2026-10 最真实的一条链路 —— 守卫逻辑本身没问题，
 * 错在判据站在了一个会被单独回收的介质上。
 */
test('RG-03 基线被回收归零时，高水位必须仍能拦住空态', () => {
  const baselineAfterWipe = 0 // localStorage 被系统回收
  const highWater = 80 // 存在 IDB，与 nav 同介质，不会一起没
  assert.equal(
    checkUserSitesAgainstBaseline('[]', baselineAfterWipe).tripped,
    false,
    '基线归零 → 骤降判定失效（这正是旧版事故的根因）'
  )
  assert.equal(
    isSuspectedWipe(0, highWater),
    true,
    '高水位必须兜住，否则空态仍会畅通写回'
  )
})

// ---------- 执行 ----------
let failed = 0
for (const t of tests) {
  try {
    await t.fn()
    console.log(`  ✔ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✘ ${t.name}`)
    console.error(e)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
