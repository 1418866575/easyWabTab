/**
 * 导航守卫依据（navMeta）单测 —— v20「基线搬进 IndexedDB」回归
 *
 * 覆盖 2026-10 事故的根因修复：
 *   旧版把降级守卫的基线存在 localStorage，而 localStorage 会被移动端系统**单独回收**，
 *   回收后基线归零 → shouldGuardDrop 恒 false → 写盘/推送守卫同时失效 →
 *   空态畅通写回 IDB 并推上云，用户看到「只剩内置站点」。
 *
 * 修复要点：**守卫依据必须与被守卫的数据同介质、同生共死**。
 * 本文件断言的就是这件事，以及由此引入的高水位兜底。
 *
 * 运行：node --experimental-strip-types scripts/test-nav-meta.ts
 *
 * 说明：navMeta 对持久化后端采用依赖注入（configureNavMetaStorage），自身零存储依赖，
 * 因此这里只需注入一个内存后端即可断言，无需模拟 IndexedDB。
 */
import assert from 'node:assert/strict'

const {
  loadNavMeta,
  reloadNavMeta,
  readBaseline,
  writeBaseline,
  clearBaseline,
  ensureBaseline,
  readHighWater,
  noteHighWater,
  resetNavMeta,
  persistNavMeta,
  navMetaSnapshot,
  isNavMetaLoaded,
  configureNavMetaStorage,
  resetNavMetaStorage
} = await import('../src/composables/navMeta.ts')
import type { NavMetaRecord } from '../src/composables/navMeta.ts'

// ---------- 内存版存储后端 ----------
let backing: NavMetaRecord | null = null
let writeCount = 0

function mountStorage(): void {
  backing = null
  writeCount = 0
  configureNavMetaStorage(
    async () => backing,
    async (record) => {
      writeCount++
      backing = { ...record }
    }
  )
}

/** 未装配后端（模拟注入遗漏/存储层故障） */
function unmountStorage(): void {
  resetNavMetaStorage()
}

const tests: { name: string; fn: () => void | Promise<void> }[] = []
function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn })
}

// ===== 自我保护：未预载 / 未装配 绝不落盘 =====

test('NM-01 未预载时拒绝落盘（不能用内存初始值 0 覆盖真实基线）', async () => {
  mountStorage()
  backing = { baseline: 200, highWater: 200 } // 上次会话留下的真实值

  // 此时 loaded=false，任何写操作都不许落到后端
  writeBaseline(0)
  resetNavMeta()
  await persistNavMeta()

  assert.deepEqual(backing, { baseline: 200, highWater: 200 }, '未预载时的写入不得落盘')
  assert.equal(writeCount, 0)
})

test('NM-02 未装配存储后端时静默降级，不抛错也不写坏数据', async () => {
  unmountStorage()
  await reloadNavMeta()
  writeBaseline(42)
  noteHighWater(42)
  await persistNavMeta() // 无处可写，应静默跳过
  assert.equal(readBaseline(), 42, '内存语义仍然正常')
  assert.equal(readHighWater(), 42)
})

// ===== 预载与读写 =====

test('NM-03 预载后基线/高水位从后端读入内存', async () => {
  mountStorage()
  backing = { baseline: 137, highWater: 180 }
  await reloadNavMeta()
  assert.equal(isNavMetaLoaded(), true)
  assert.equal(readBaseline(), 137)
  assert.equal(readHighWater(), 180)
  assert.deepEqual(navMetaSnapshot(), { baseline: 137, highWater: 180 })
})

test('NM-03b loadNavMeta 幂等：重复调用不会重新读（避免中途被覆盖）', async () => {
  mountStorage()
  backing = { baseline: 10, highWater: 10 }
  await reloadNavMeta()
  assert.equal(readBaseline(), 10)

  backing = { baseline: 999, highWater: 999 } // 外部偷偷改了后端
  await loadNavMeta()
  assert.equal(readBaseline(), 10, '已预载则不再读，内存值不受影响')

  await reloadNavMeta() // 显式重载才重新读
  assert.equal(readBaseline(), 999)
})

test('NM-04 高水位只增不减（它是「本机曾达到的最大规模」）', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()
  assert.equal(readHighWater(), 0)

  noteHighWater(50)
  assert.equal(readHighWater(), 50)
  noteHighWater(30)
  assert.equal(readHighWater(), 50, '更小的值不应拉低高水位')
  noteHighWater(120)
  assert.equal(readHighWater(), 120)
  noteHighWater(120)
  assert.equal(readHighWater(), 120, '相等值不变化')
})

test('NM-05 数量归一：非数字/负数归 0，小数取下整', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()

  writeBaseline(Number.NaN)
  assert.equal(readBaseline(), 0)
  writeBaseline(-5)
  assert.equal(readBaseline(), 0)
  writeBaseline(7.9)
  assert.equal(readBaseline(), 7, '应取下整')
  noteHighWater(-1)
  assert.equal(readHighWater(), 0)
  noteHighWater(10.9)
  assert.equal(readHighWater(), 10)
})

test('NM-06 持久化往返：写内存 → 落盘 → 重载后仍在', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()

  writeBaseline(240)
  noteHighWater(240)
  await persistNavMeta()

  assert.deepEqual(backing, { baseline: 240, highWater: 240 }, '应立即写入后端')

  // 模拟重启：内存清空后重新预载
  await reloadNavMeta()
  assert.equal(readBaseline(), 240)
  assert.equal(readHighWater(), 240)
})

test('NM-07 ensureBaseline 只在无基线时确立', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()

  ensureBaseline(30)
  assert.equal(readBaseline(), 30)
  ensureBaseline(3)
  assert.equal(readBaseline(), 30, '已有基线不应被更小的值覆盖')
  ensureBaseline(0)
  assert.equal(readBaseline(), 30, '传 0 不应清除基线')
})

test('NM-08 clearBaseline 只清基线、不动高水位', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()
  writeBaseline(90)
  noteHighWater(90)

  clearBaseline()
  assert.equal(readBaseline(), 0)
  assert.equal(readHighWater(), 90, '高水位是历史事实，清基线不应抹掉它')
})

test('NM-09 resetNavMeta 清空两者（恢复出厂用，否则清空后写盘会被自己拦下）', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()
  writeBaseline(90)
  noteHighWater(90)

  resetNavMeta()
  assert.deepEqual(navMetaSnapshot(), { baseline: 0, highWater: 0 })
  await persistNavMeta()
  assert.deepEqual(backing, { baseline: 0, highWater: 0 })
})

// ===== 事故回归：介质对称性 =====

test('NM-10 核心：守卫依据不再随 localStorage 一起被回收', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()
  writeBaseline(180)
  noteHighWater(180)
  await persistNavMeta()

  // 旧版基线存在 localStorage，这一事件会让它归零 → 守卫整体失效。
  // 现在基线在 IDB（与 nav 主数据同介质），该事件对它毫无影响。
  assert.deepEqual(backing, { baseline: 180, highWater: 180 })
  assert.equal(readBaseline(), 180)
  assert.equal(readHighWater(), 180)
})

test('NM-11 存储记录缺失或畸形时退化为「无基线 = 不防护」', async () => {
  mountStorage()
  backing = null
  await reloadNavMeta()
  assert.deepEqual(navMetaSnapshot(), { baseline: 0, highWater: 0 }, '无记录 → 归零')

  backing = { baseline: Number.NaN, highWater: 50 }
  await reloadNavMeta()
  assert.equal(readBaseline(), 0, '畸形基线 → 归零，绝不制造假判据')
  assert.equal(readHighWater(), 50)
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
