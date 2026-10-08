/**
 * 导航站数据丢失——根因复现与修复验证（只读演练，不碰真实数据）
 *
 * 背景：v18 已把导航偏好从 localStorage 迁到 IDB `nav` store，但**只有导航站**仍频繁
 * 「恢复到初始状态（只剩内置站点）」，工作台各模块却不丢。
 *
 * 本脚本对同一事故场景做**修复前 / 修复后**对照，全部复用生产模块真实代码：
 *   A. 守卫基线存在 localStorage → 该介质被回收后守卫整体失效（事故主因）
 *   B. user-sites 超过影子 512KB 上限 → 旧实现会**删除**影子（放大器）
 *   C. nav 一条记录装 15 个键 + 整包覆盖（结构隐患，本轮未改）
 *
 * v20 修复后的判定链：基线 + 高水位都存 IDB（navmeta），与 nav 主数据同介质，
 * 因此 localStorage 被回收不再影响守卫；即便基线丢失，高水位仍能兜住空态。
 *
 * 运行：node --experimental-strip-types scripts/diag-nav-loss.ts
 * 退出码：0 = 事故形态已被全部覆盖；1 = 仍有未覆盖的事故形态
 */
import {
  GUARD_MIN_BASELINE,
  evaluateUserSitesCount,
  isSuspectedWipe,
  shouldGuardDrop
} from '../src/composables/navDataGuard.ts'
import {
  configureNavMetaStorage,
  reloadNavMeta,
  readBaseline,
  writeBaseline,
  readHighWater,
  noteHighWater
} from '../src/composables/navMeta.ts'
import { writeShadow, readShadow, SHADOW_MAX_VALUE_LEN } from '../src/composables/navShadow.ts'
import type { NavMetaRecord } from '../src/composables/navMeta.ts'

// ---------- 内存版 localStorage ----------
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size
  },
  clear: () => mem.clear(),
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  removeItem: (k: string) => void mem.delete(k),
  setItem: (k: string, v: string) => void mem.set(k, String(v))
} as unknown as Storage

// ---------- navmeta 后端（模拟 IndexedDB，独立于 localStorage）----------
let idbBacking: NavMetaRecord | null = null
configureNavMetaStorage(
  async () => idbBacking,
  async (record) => {
    idbBacking = { ...record }
  }
)

const SITE_COUNT = 80
let defect = 0
function check(label: string, bad: boolean, detail = ''): void {
  console.log(`  ${bad ? '✗ 事故形态' : '✔ 已被修复'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (bad) defect++
}

/** 造一份带 base64 图标的站点数据（真实场景：用户给站点上传/抓取了图标） */
function makeSites(n: number, iconBytes: number): string {
  const b64 = 'A'.repeat(iconBytes)
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      name: `站点${i}`,
      url: `https://example${i}.com`,
      icon: `data:image/png;base64,${b64}`,
      category: 'tech',
      tags: ['常用'],
      sort: 1
    }))
  )
}

console.log('='.repeat(74))
console.log('A. 事故主因：守卫基线存在 localStorage，该介质被回收后守卫整体失效')
console.log('='.repeat(74))
console.log('  v18 迁移的原始动机正是「移动端 localStorage 被系统回收」，')
console.log('  但降级守卫的基线却留在了 localStorage 上（v19 及更早）。\n')

// v20：基线/高水位已迁入 IDB，与 nav 同介质
idbBacking = null
await reloadNavMeta()
writeBaseline(SITE_COUNT)
noteHighWater(SITE_COUNT)
console.log(
  `  初始：用户站点 ${SITE_COUNT} 个 → IDB 基线 ${readBaseline()} / 高水位 ${readHighWater()}`
)
console.log('  （v19 及更早：基线还存在 localStorage，影子也在那里）\n')

// 模拟：移动端系统回收 localStorage
mem.clear()
console.log('  事件：移动端系统回收 localStorage（v19 的基线与影子同时蒸发）\n')

// 修复前的形态只做展示（历史事实），不计入下面的 defect 统计——
// defect 统计的是「当前代码仍存在的事故形态」，目标为 0
console.log('  ── 修复前（v19 判定链）──')
const legacyBlocked = shouldGuardDrop(0, 0) // localStorage 里的基线已随回收归零
console.log(
  `  [历史] shouldGuardDrop(0, 0) = ${legacyBlocked}` +
    `（false = 放行 → 空态畅通写回 IDB 并推上云）`
)
console.log(`     基线 0 < GUARD_MIN_BASELINE(${GUARD_MIN_BASELINE}) → 恒返回 false`)

console.log('\n  ── 修复后（v20 判定链）──')
const v20Baseline = readBaseline() // 来自 IDB，不受 localStorage 回收影响
const v20High = readHighWater()
const verdict = evaluateUserSitesCount(0, v20Baseline)
const wipe = isSuspectedWipe(0, v20High)
check('基线是否存活', v20Baseline !== SITE_COUNT, `IDB 基线 = ${v20Baseline}（应为 ${SITE_COUNT}）`)
check(`高水位兜底 isSuspectedWipe(0, ${v20High})`, !wipe, `= ${wipe}（true = 拦住空态）`)
console.log(`     骤降判定 = ${verdict.tripped}；高水位判定 = ${wipe} → 落盘被拒绝`)

console.log('\n' + '='.repeat(74))
console.log('B. 放大器：user-sites 超过影子 512KB 上限，旧实现会删除影子')
console.log('='.repeat(74))
console.log(`  SHADOW_MAX_VALUE_LEN = ${SHADOW_MAX_VALUE_LEN} 字节（${SHADOW_MAX_VALUE_LEN / 1024}KB）`)
console.log('  v20 修正：改为写「去图标降级版」，放不下则保留旧影子，绝不主动删除。\n')

for (const [n, kb] of [
  [60, 2],
  [60, 8],
  [120, 8]
] as [number, number][]) {
  mem.clear()
  const raw = makeSites(n, kb * 1024)
  writeShadow({ 'user-sites': raw })
  const back = readShadow()['user-sites']
  const sizeKb = (raw.length / 1024).toFixed(0)
  const lost = back === undefined
  check(
    `${n} 站 × ${kb}KB 图标（≈${sizeKb}KB）→ 影子${lost ? '丢失' : '保留'}`,
    lost,
    lost ? 'IDB 出事时无备份可恢复' : '超限也能保住站点清单'
  )
  if (back) {
    let count = -1
    try {
      count = (JSON.parse(back) as unknown[]).length
    } catch {
      count = -1
    }
    console.log(`     影子内站点数 = ${count}（原始 ${n}）`)
  }
}

console.log('\n' + '='.repeat(74))
console.log('C. 结构隐患：nav 一条记录装 15 个键 + 整包覆盖（本轮未改）')
console.log('='.repeat(74))
console.log('  IDB `nav` store 只有 1 条记录（键 "items"），值 = NavPrefsRecord（15 个键）。')
console.log('  任何一次 setPref（哪怕是 MB 级 icon-cache 更新）都会整包 {...prefs} 覆盖写回。\n')

const huge = { 'user-sites': makeSites(80, 4 * 1024), 'icon-cache': 'B'.repeat(3 * 1024 * 1024) }
const totalMb = (Object.values(huge).reduce((a, b) => a + b.length, 0) / 1024 / 1024).toFixed(2)
console.log(`  示例整包体积 ≈ ${totalMb} MB（user-sites 320KB + icon-cache 3MB）`)
console.log('  → 每次点击站点都触发一次整包序列化 + IDB 写入')
console.log('  → 移动端隐藏/卸载时的异步事务易被中止，失败仅 console.error（静默）')
console.log('  → 建议后续把 nav 拆成按 key 的多记录，并把 icon-cache 独立成 store')

console.log('\n' + '='.repeat(74))
console.log('D. 与工作台的对照（为什么只有导航站丢）')
console.log('='.repeat(74))
const rows: [string, string, string][] = [
  ['持久化粒度', '15 键挤在 nav 一条记录', '每模块一个独立 store'],
  ['写入方式', '400ms 防抖 → void 整包覆盖', 'await idbPut 直写，无中间层'],
  ['内存缓存', '模块级 prefs，读写都过它', '无，store ref 即数据源'],
  ['写失败处理', '静默 console.error', '调用方 await，可感知'],
  ['额外介质依赖', 'v20 起已消除（原 localStorage）', '无'],
  ['每次装载', 'fetch /data/sites.md 重新合并内置站点', '纯 idbGet 装载']
]
for (const [k, nav, wb] of rows) {
  console.log(`  ${k.padEnd(6, '　')} | 导航站：${nav.padEnd(30, ' ')} | 工作台：${wb}`)
}

console.log('\n' + '='.repeat(74))
console.log(`结论：仍有 ${defect} 项事故形态未被覆盖（目标为 0）`)
console.log('='.repeat(74))
console.log(`
  v20 已修复：
   1. 守卫依据（基线 + 高水位）迁入 IDB navmeta，与 nav 主数据同介质、同生共死，
      彻底消除「IDB 数据还在、判据却被 localStorage 回收」的不对称。
   2. 新增高水位（只增不减）作为第二道判据，覆盖「基线已同步变小」的盲区。
   3. 落盘口（useNavPrefs.writeThrough）新增空态拦截，拦的是**整包** nav 记录 ——
      theme / categories / icon-cache 等任何一次写入都不会再把空态固化。
   4. 影子遇超限改为写去图标降级版，放不下则保留旧影子，绝不主动删除。
   5. 影子回填改为 merge，不再用 10 个影子键冲掉整条 nav 记录。

  待办（结构性，建议独立分支）：
   6. nav 拆成按 key 的多记录，消除写放大与整包覆盖风险。
   7. MB 级 icon-cache 移出 nav 独立成 store。
`)
process.exit(defect > 0 ? 1 : 0)
