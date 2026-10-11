/**
 * 智能工作台设置纯逻辑测试（菜单 + 技能分类）
 * 运行：npm run test:smart-settings
 */
import assert from "node:assert/strict"
import {
  SMART_MENU_KEYS,
  SMART_MENU_DEFAULT_LABELS,
  SMART_MENU_ICONS,
  SMART_MENU_LABEL_MAX,
  SMART_CATEGORY_NAME_MAX,
  UNCATEGORIZED,
  type SmartMenuData,
  defaultMenuData,
  normalizeMenuData,
  resolveMenu,
  visibleMenu,
  moveMenu,
  reorderMenu,
  setMenuLabel,
  toggleMenuHidden,
  canHideMenu,
  normalizeCategories,
  addCategory,
  renameCategory,
  removeCategory,
  collectCategories,
  countByCategory,
  SMART_SKILL_DEFAULT_CATEGORIES,
  mergeDefaultCategories
} from "../src/composables/smartSettingsCore.ts"

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) { tests.push({ name, fn }) }

// T1 常量完整性：3 键、字典对齐
test("T1 SMART_MENU 常量 3 项齐、字典大小匹配", () => {
  assert.equal(SMART_MENU_KEYS.length, 4)
  assert.deepEqual([...SMART_MENU_KEYS], ["overview", "skills", "prompts", "workflows"])
  assert.equal(Object.keys(SMART_MENU_DEFAULT_LABELS).length, 4)
  assert.equal(Object.keys(SMART_MENU_ICONS).length, 4)
  for (const k of SMART_MENU_KEYS) {
    assert.equal(typeof SMART_MENU_DEFAULT_LABELS[k], "string")
    assert.equal(typeof SMART_MENU_ICONS[k], "string")
  }
})

// T2 默认数据：全 3 项、无改名、无隐藏；且返回新对象
test("T2 defaultMenuData 默认三项、引用安全", () => {
  const a = defaultMenuData()
  const b = defaultMenuData()
  assert.deepEqual(a.order, ["overview", "skills", "prompts", "workflows"])
  assert.deepEqual(a.labels, {})
  assert.deepEqual(a.hidden, [])
  assert.notEqual(a, b)
  assert.notEqual(a.order, b.order)
})

// T3 normalizeMenuData 非法输入回落默认
test("T3 normalizeMenuData 非法 / 空输入回落到默认", () => {
  assert.deepEqual(normalizeMenuData(undefined), defaultMenuData())
  assert.deepEqual(normalizeMenuData(null), defaultMenuData())
  assert.deepEqual(normalizeMenuData("bad"), defaultMenuData())
  assert.deepEqual(normalizeMenuData({ order: "x" }), defaultMenuData())
})

// T4 未知 key 剔除、缺失 key 补在末尾、重复去重
test("T4 normalizeMenuData 补全 / 去重 / 剔除未知", () => {
  const out = normalizeMenuData({
    order: ["skills", "skills", "ghost", "overview"],
    labels: { ghost: "幽灵" },
    hidden: ["ghost"]
  })
  assert.deepEqual(out.order, ["skills", "overview", "prompts", "workflows"])
  assert.deepEqual(out.labels, {})
  assert.deepEqual(out.hidden, []) // ghost 不是已知 key
})

// T5 改名超长截断（按 code point，emoji 不拆代理对）
test("T5 normalizeMenuData 改名截断到 12 且不拆代理对", () => {
  const long = "一二三四五六七八九十十一十二十三"
  const out = normalizeMenuData({ labels: { overview: long } })
  assert.equal(out.labels.overview, Array.from(long).slice(0, SMART_MENU_LABEL_MAX).join(""))
  assert.equal(Array.from(out.labels.overview).length, SMART_MENU_LABEL_MAX)

  const emoji = Array.from({ length: 20 }, () => "🙂").join("")
  const out2 = normalizeMenuData({ labels: { skills: emoji } })
  assert.equal(Array.from(out2.labels.skills).length, SMART_MENU_LABEL_MAX)
  assert.equal(out2.labels.skills, "🙂".repeat(SMART_MENU_LABEL_MAX))
})

// T6 幂等
test("T6 normalizeMenuData 幂等", () => {
  const raw = { order: ["prompts", "overview"], labels: { overview: "看板" }, hidden: ["skills"] }
  const once = normalizeMenuData(raw)
  const twice = normalizeMenuData(once)
  assert.deepEqual(once, twice)
})

// T7 resolveMenu：顺序 / 改名 / 图标 / hidden
test("T7 resolveMenu 按顺序解析并应用改名", () => {
  const items = resolveMenu({ order: ["prompts", "skills"], labels: { prompts: "提示库" }, hidden: ["skills"] })
  assert.deepEqual(items.map(i => i.key), ["prompts", "skills", "overview", "workflows"])
  assert.equal(items[0].label, "提示库")
  assert.equal(items[1].label, SMART_MENU_DEFAULT_LABELS.skills)
  assert.equal(items[1].hidden, true)
  assert.equal(items[0].hidden, false)
  assert.equal(items[2].icon, SMART_MENU_ICONS.overview)
})

// T8 visibleMenu 过滤隐藏项
test("T8 visibleMenu 只留可见项", () => {
  const v = visibleMenu({ order: ["overview", "skills", "prompts"], labels: {}, hidden: ["skills"] })
  assert.deepEqual(v.map(i => i.key), ["overview", "prompts", "workflows"])
})

// T9 moveMenu 上移 / 下移 / 越界
test("T9 moveMenu 交换与越界保护", () => {
  const d = defaultMenuData()
  assert.deepEqual(moveMenu(d, "skills", "up").order, ["skills", "overview", "prompts", "workflows"])
  assert.deepEqual(moveMenu(d, "skills", "down").order, ["overview", "prompts", "skills", "workflows"])
  // 越界：首项上移、末项下移都原样返回
  assert.deepEqual(moveMenu(d, "overview", "up").order, d.order)
  assert.deepEqual(moveMenu(d, "workflows", "down").order, d.order)
  // 未知 key
  assert.deepEqual(moveMenu(d, "ghost", "up").order, d.order)
})

// T10 reorderMenu 拖拽换位
test("T10 reorderMenu 拖拽换位与非法下标保护", () => {
  const d = defaultMenuData()
  assert.deepEqual(reorderMenu(d, 0, 2).order, ["skills", "prompts", "overview", "workflows"])
  assert.deepEqual(reorderMenu(d, 2, 0).order, ["prompts", "overview", "skills", "workflows"])
  assert.deepEqual(reorderMenu(d, 1, 1).order, d.order) // 同位置
  assert.deepEqual(reorderMenu(d, -1, 1).order, d.order)
  assert.deepEqual(reorderMenu(d, 0, 9).order, d.order)
})

// T11 setMenuLabel：空值恢复默认、与默认同名则删除、超长截断
test("T11 setMenuLabel 改名 / 恢复默认 / 截断", () => {
  const d = defaultMenuData()
  const renamed = setMenuLabel(d, "skills", "我的技能")
  assert.equal(renamed.labels.skills, "我的技能")

  const restored = setMenuLabel(renamed, "skills", "   ")
  assert.equal(restored.labels.skills, undefined)

  const sameAsDefault = setMenuLabel(renamed, "skills", SMART_MENU_DEFAULT_LABELS.skills)
  assert.equal(sameAsDefault.labels.skills, undefined)

  const long = "a".repeat(50)
  assert.equal(Array.from(setMenuLabel(d, "overview", long).labels.overview ?? "").length, SMART_MENU_LABEL_MAX)

  // 未知 key 不动
  assert.deepEqual(setMenuLabel(d, "ghost", "x").labels, {})
})

// T12 toggleMenuHidden 与 canHideMenu 的兜底
test("T12 toggleMenuHidden / canHideMenu 至少留一项可见", () => {
  const d = defaultMenuData()
  assert.equal(canHideMenu(d, "overview"), true)
  const h1 = toggleMenuHidden(d, "overview")
  assert.deepEqual(h1.hidden, ["overview"])
  assert.equal(canHideMenu(h1, "skills"), true)
  const h2 = toggleMenuHidden(h1, "skills")
  // 新增工作流后菜单共 4 项，此处可见：prompts、workflows
  assert.equal(canHideMenu(h2, "workflows"), true)
  const h3 = toggleMenuHidden(h2, "workflows")
  assert.deepEqual(h3.hidden, ["overview", "skills", "workflows"])
  // 只剩 prompts 可见 → 不允许再隐藏
  assert.equal(canHideMenu(h3, "prompts"), false)
  // 已隐藏的项允许再显示
  assert.equal(canHideMenu(h3, "overview"), true)
  // 再切一次回到显示
  const back = toggleMenuHidden(h1, "overview")
  assert.deepEqual(back.hidden, [])
})

// T13 所有菜单函数不改入参
test("T13 菜单函数均不改入参", () => {
  const d: SmartMenuData = { order: ["overview", "skills", "prompts"], labels: {}, hidden: [] }
  const snapshot = JSON.parse(JSON.stringify(d))
  moveMenu(d, "overview", "down")
  reorderMenu(d, 0, 2)
  setMenuLabel(d, "overview", "x")
  toggleMenuHidden(d, "overview")
  assert.deepEqual(d, snapshot)
})

// T14 normalizeCategories 清洗
test("T14 normalizeCategories 去空白 / 去重 / 去空 / 截断", () => {
  assert.deepEqual(normalizeCategories(undefined), [])
  assert.deepEqual(normalizeCategories("x"), [])
  assert.deepEqual(normalizeCategories([1, null, {}]), [])
  assert.deepEqual(normalizeCategories([" 写作 ", "写作", "", "  ", "研发"]), ["写作", "研发"])
  const long = "分".repeat(SMART_CATEGORY_NAME_MAX + 5)
  const out = normalizeCategories([long])
  assert.equal(Array.from(out[0]).length, SMART_CATEGORY_NAME_MAX)
})

// T15 addCategory 校验
test("T15 addCategory 空 / 重名 / 超长拒绝", () => {
  const cur = ["写作"]
  assert.equal(addCategory(cur, "   ").ok, false)
  assert.equal(addCategory(cur, "").error, "请填写分类名称")
  assert.equal(addCategory(cur, "写作").ok, false)
  assert.ok((addCategory(cur, "写作").error ?? "").includes("已存在"))
  assert.equal(addCategory(cur, "x".repeat(SMART_CATEGORY_NAME_MAX + 1)).ok, false)
  const ok = addCategory(cur, "研发")
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.list, ["写作", "研发"])
  assert.deepEqual(cur, ["写作"]) // 不改入参
})

// T16 renameCategory
test("T16 renameCategory 改名 / 重名 / 不存在 / 同名", () => {
  const cur = ["写作", "研发"]
  assert.equal(renameCategory(cur, "写作", "文案").ok, true)
  assert.deepEqual(renameCategory(cur, "写作", "文案").list, ["文案", "研发"])
  assert.equal(renameCategory(cur, "写作", "研发").ok, false) // 撞已有分类
  assert.equal(renameCategory(cur, "写作", "写作").ok, true) // 同名视为无变化
  assert.deepEqual(renameCategory(cur, "写作", "写作").list, cur)
  assert.equal(renameCategory(cur, "幽灵", "其它").ok, false)
  assert.equal(renameCategory(cur, "写作", "  ").ok, false)
  assert.equal(renameCategory(cur, "写作", "x".repeat(SMART_CATEGORY_NAME_MAX + 1)).ok, false)
})

// T17 removeCategory
test("T17 removeCategory 删除且不改入参", () => {
  const cur = ["写作", "研发", "其它"]
  assert.deepEqual(removeCategory(cur, "研发"), ["写作", "其它"])
  assert.deepEqual(removeCategory(cur, "幽灵"), cur)
  assert.deepEqual(cur, ["写作", "研发", "其它"])
})

// T18 collectCategories：自定义顺序优先，技能上的分类按序补入
test("T18 collectCategories 合并去重并保持自定义顺序", () => {
  const out = collectCategories(["研发", "写作"], ["写作", "运营", " 运营 ", ""])
  assert.deepEqual(out, ["研发", "写作", "运营"])
  assert.deepEqual(collectCategories([], ["b", "a", "b"]), ["b", "a"])
  assert.deepEqual(collectCategories(["自定义"], []), ["自定义"])
})

// T19 countByCategory 空值归到未分类
test("T19 countByCategory 计数与未分类兜底", () => {
  assert.deepEqual(countByCategory(["写作", "写作", "研发"]), { 写作: 2, 研发: 1 })
  assert.deepEqual(countByCategory(["", "  ", null as unknown as string]), { [UNCATEGORIZED]: 3 })
  assert.deepEqual(countByCategory([]), {})
})

// T20 完整往返：默认 → 改名 → 排序 → 隐藏 → 归一化后仍自洽
test("T20 菜单设置往返：改名 + 拖拽 + 隐藏后仍可解析", () => {
  let d = defaultMenuData()
  d = setMenuLabel(d, "prompts", "提示库")
  d = reorderMenu(d, 2, 0)
  d = toggleMenuHidden(d, "skills")
  const items = resolveMenu(d)
  assert.deepEqual(items.map(i => i.key), ["prompts", "overview", "skills", "workflows"])
  assert.equal(items[0].label, "提示库")
  assert.deepEqual(visibleMenu(d).map(i => i.key), ["prompts", "overview", "workflows"])
  // 持久化后再读取（JSON 往返）保持一致
  assert.deepEqual(normalizeMenuData(JSON.parse(JSON.stringify(d))), normalizeMenuData(d))
})

// T21 mergeDefaultCategories：默认分类补在最前（推荐顺序），用户自建分类排其后；幂等且不改入参
test("T21 mergeDefaultCategories 补默认分类且幂等", () => {
  const list = ["画画", "自定义"]
  const out = mergeDefaultCategories(list)
  // 已在默认列表里的「画画」不重复出现
  assert.deepEqual(out, [...SMART_SKILL_DEFAULT_CATEGORIES, "自定义"])
  assert.equal(out.filter(c => c === "画画").length, 1)
  // 默认分类排在前，自建的排在后
  assert.ok(out.indexOf("自定义") > out.indexOf("办公"))
  // 空列表 → 得到全部默认分类
  assert.deepEqual(mergeDefaultCategories([]), [...SMART_SKILL_DEFAULT_CATEGORIES])
  // 幂等：结果再喂一次不变
  assert.deepEqual(mergeDefaultCategories(out), out)
  // 脏数据（空白 / 重名 / 非字符串）先归一化再合并
  assert.deepEqual(
    mergeDefaultCategories(["  ", "自定义", "自定义", null as unknown as string]),
    [...SMART_SKILL_DEFAULT_CATEGORIES, "自定义"]
  )
  // 不改入参
  assert.deepEqual(list, ["画画", "自定义"])
})

let passed = 0, failed = 0
for (const t of tests) {
  try { t.fn(); passed++; console.log(`  ✓ ${t.name}`) }
  catch (e) { failed++; console.error(`  ✗ ${t.name}`); console.error(e) }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
