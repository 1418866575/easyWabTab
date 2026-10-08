/**
 * 导航存储结构的架构约束测试（静态扫描，防回归）
 *
 * 背景（2026-10 事故链）：nav 曾用「一条记录装 15 个键」的整包存储，
 * 任何一次写入都是 `idbPut('nav', {...整包})` 覆盖，导致两类真实故障：
 *   1. 写放大：改一个键也要重序列化全量（含 MB 级 icon-cache）；
 *   2. **跨模块覆盖**：工具箱落盘时把「启动时的 nav 快照」整体写回，
 *      用户在打开工具箱之后新增的站点会被这份旧快照直接抹掉 ——
 *      这正是「只有导航站数据会莫名回退」的一条主因（工作台用独立 store，碰不到）。
 *
 * v21 起 nav 按 key 多记录存储，各写各的。本文件用静态扫描锁住这个约束，
 * 免得日后有人图省事改回整包覆盖。
 *
 * 运行：node --experimental-strip-types scripts/test-nav-storage.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Windows 下 URL.pathname 会带前导斜杠（/D:/...），必须走 fileURLToPath
const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const ROOT = fileURLToPath(new URL('../', import.meta.url))

/**
 * 剥离注释但**保留行号**（注释行替换为空串而非删除）。
 * 否则 JSDoc 里举例的旧写法（如 `idbPut('nav', {...})`）会被误判成真实调用。
 */
function stripCommentsKeepingLines(text: string): string {
  let inBlock = false
  return text
    .split('\n')
    .map((line) => {
      let out = line
      if (inBlock) {
        const end = out.indexOf('*/')
        if (end === -1) return ''
        inBlock = false
        out = out.slice(end + 2)
      }
      for (;;) {
        const start = out.indexOf('/*')
        if (start === -1) break
        const end = out.indexOf('*/', start + 2)
        if (end === -1) {
          out = out.slice(0, start)
          inBlock = true
          break
        }
        out = out.slice(0, start) + out.slice(end + 2)
      }
      const slash = out.indexOf('//')
      if (slash !== -1) out = out.slice(0, slash)
      return out
    })
    .join('\n')
}

/** 收集 src 下所有 .ts / .vue 源文件 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|vue)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

const files = walk(SRC)
const sources = new Map<string, string>()
for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  sources.set(relative(ROOT, f).replace(/\\/g, '/'), stripCommentsKeepingLines(raw))
}

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

/** 找出包含某个正则的源文件（返回 相对路径:行号 列表） */
function findWhere(pattern: RegExp): string[] {
  const hits: string[] = []
  for (const [path, text] of sources) {
    text.split('\n').forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${path}:${i + 1}`)
    })
  }
  return hits
}

test('NS-01 禁止整包覆盖写 nav（必须走 idbPutKey 按 key 写）', () => {
  const hits = findWhere(/idbPut\(\s*'nav'/).filter((h) => !h.includes('useNavPrefs.ts'))
  assert.deepEqual(hits, [], `发现整包覆盖写 nav：\n${hits.join('\n')}\n改用 idbPutKey('nav', key, value)`)
})

test('NS-02 整包读 nav 只允许出现在迁移/兼容回退处', () => {
  const allowed = [
    'src/composables/useNavPrefs.ts', // migrateNavToPerKeyRecords：读旧整包做拆分
    'src/toolbox/prefs/useToolboxPrefs.ts' // loadStored：兼容 v20 整包内的字段
  ]
  // 注释里提到旧写法不算；只看真实调用
  const hits = findWhere(/idbGet(<[^>]*>)?\(\s*'nav'\s*\)/).filter(
    (h) => !allowed.some((a) => h.startsWith(a))
  )
  assert.deepEqual(
    hits,
    [],
    `nav 应整体装载（idbGetAllEntries）或按键读取（idbGetKey）：\n${hits.join('\n')}`
  )
})

test('NS-03 工具箱不得再整包写 nav（跨模块覆盖站点数据的元凶）', () => {
  const path = 'src/toolbox/prefs/useToolboxPrefs.ts'
  const text = sources.get(path)
  assert.ok(text, '应能读到工具箱偏好源码')
  assert.ok(
    !/idbPut\(\s*'nav'/.test(text),
    '工具箱必须只写自己那条记录（idbPutKey），整包写会用旧快照抹掉期间新增的站点'
  )
  assert.ok(
    /idbPutKey\(\s*'nav'/.test(text),
    '工具箱应通过 idbPutKey 写入专属键'
  )
  // 旧实现的标志：把「nav 现有记录」摊平后一起写回
  assert.ok(
    !/\.\.\.current/.test(text),
    '不得再把 nav 其它键带着一起写回（那正是用旧快照覆盖新数据的写法）'
  )
})

test('NS-04 工具箱键与 nav 整包键不能同名（两套含义撞车的根源）', () => {
  const idb = sources.get('src/composables/useIdb.ts')
  assert.ok(idb)
  const toolboxKey = /export const TOOLBOX_NAV_KEY = '([^']+)'/.exec(idb)?.[1]
  const idbKey = /export const IDB_KEY = '([^']+)'/.exec(idb)?.[1]
  assert.ok(toolboxKey, '应导出 TOOLBOX_NAV_KEY')
  assert.ok(idbKey, '应导出 IDB_KEY')
  assert.notEqual(
    toolboxKey,
    idbKey,
    `工具箱键(${toolboxKey})不能等于 store 的整包键(${idbKey})，否则记录内字段与记录键会混淆`
  )
})

test('NS-05 icon-cache 已移出 nav（避免 MB 级数据挤在用户资产旁）', () => {
  const idb = sources.get('src/composables/useIdb.ts')
  assert.ok(idb)
  const navBlock = /export const NAV_STORE_KEYS = \[([\s\S]*?)\] as const/.exec(idb)?.[1] ?? ''
  assert.ok(!navBlock.includes("'icon-cache'"), 'NAV_STORE_KEYS 不应再包含 icon-cache')
  assert.ok(
    /IDB_ICONCACHE_STORES = \['iconcache'\]/.test(idb),
    '应有独立的 iconcache store'
  )
})

test('NS-06 图标缓存只写独立 store，不再写 nav', () => {
  const path = 'src/composables/useIconCache.ts'
  const text = sources.get(path)
  assert.ok(text)
  assert.ok(
    /idbPut\(\s*'iconcache'/.test(text),
    '图标缓存应写入独立 iconcache store'
  )
  assert.ok(
    !/setPref\(\s*ICON_CACHE_KEY/.test(text),
    '图标缓存不应再写回 nav（会重新引入 MB 级写放大）'
  )
})

test('NS-07 nav 多记录读写 API 已导出且被使用', () => {
  const idb = sources.get('src/composables/useIdb.ts')
  assert.ok(idb)
  for (const fn of ['idbPutKey', 'idbGetKey', 'idbDeleteKey', 'idbGetAllEntries']) {
    assert.ok(
      new RegExp(`export function ${fn}\\b`).test(idb),
      `useIdb 应导出 ${fn}`
    )
  }
  const navPrefs = sources.get('src/composables/useNavPrefs.ts')
  assert.ok(navPrefs)
  assert.ok(
    /idbGetAllEntries/.test(navPrefs),
    'useNavPrefs 应改用 idbGetAllEntries 整体装载'
  )
})

test('NS-08 DB 版本已为多记录/独立缓存结构让位', () => {
  const idb = sources.get('src/composables/useIdb.ts')
  assert.ok(idb)
  const version = Number(/export const DB_VERSION = (\d+)/.exec(idb)?.[1])
  assert.ok(version >= 21, `DB_VERSION 应 >= 21（当前 ${version}）`)
})

// ---------- 执行 ----------
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✔ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✘ ${t.name}`)
    console.error(e instanceof Error ? e.message : e)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
