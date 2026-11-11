/**
 * 前端提示词库纯逻辑测试
 * 运行：npm run test:frontend-prompts
 *
 * 守住三件事：
 * ① 28 张卡片与 28 个效果预览一一对应（编号 / 文件名 / 分类计数）；
 * ② 每条提示词都不含技术名词（用户明确要求：只描述组件或功能）；
 * ③ 筛选与计数纯函数在分类 / 关键字 / 组合条件下结果正确。
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  FRONTEND_PROMPTS,
  FRONTEND_PROMPT_CATEGORIES,
  TECH_TERMS,
  findTechnicalTerms,
  filterFrontendPrompts,
  getFrontendPrompt,
  countFrontendPrompts
} from "../src/composables/frontendPromptsCore.ts"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEMO_DIR = path.join(ROOT, "public", "frontend-prompts")

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) { tests.push({ name, fn }) }

test("T1 28 张卡片，编号 01..28 连续且唯一", () => {
  assert.equal(FRONTEND_PROMPTS.length, 28)
  assert.deepEqual(FRONTEND_PROMPTS.map(p => p.id), Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, "0")))
  assert.equal(new Set(FRONTEND_PROMPTS.map(p => p.id)).size, 28)
  FRONTEND_PROMPTS.forEach((p, i) => assert.equal(p.index, i + 1))
})

test("T2 4 个分类，计数 10 / 6 / 6 / 6", () => {
  assert.equal(FRONTEND_PROMPT_CATEGORIES.length, 4)
  assert.deepEqual(FRONTEND_PROMPT_CATEGORIES.map(c => c.id), ["layout", "basic", "select", "date"])
  const counts = countFrontendPrompts(FRONTEND_PROMPTS)
  assert.equal(counts.all, 28)
  assert.equal(counts.layout, 10)
  assert.equal(counts.basic, 6)
  assert.equal(counts.select, 6)
  assert.equal(counts.date, 6)
})

test("T3 每张卡片字段完整，分类已登记", () => {
  const known = new Set(FRONTEND_PROMPT_CATEGORIES.map(c => c.id))
  for (const p of FRONTEND_PROMPTS) {
    assert.ok(p.title.trim(), `${p.id} 缺标题`)
    assert.ok(p.summary.trim(), `${p.id} 缺摘要`)
    assert.ok(p.prompt.trim().length >= 60, `${p.id} 提示词过短`)
    assert.ok(known.has(p.category), `${p.id} 分类未登记`)
    assert.equal(p.demoFile, `demo-${p.id}.html`, `${p.id} 效果文件编号不符`)
  }
})

test("T4 提示词、标题、摘要均不含技术名词", () => {
  for (const p of FRONTEND_PROMPTS) {
    for (const [field, text] of [["标题", p.title], ["摘要", p.summary], ["提示词", p.prompt]] as const) {
      const hits = findTechnicalTerms(text)
      assert.deepEqual(hits, [], `${p.id} ${field} 出现技术词：${hits.join(" / ")}`)
    }
  }
})

test("T5 技术词守卫自身有效（正例能拦、正常文案不误伤）", () => {
  assert.ok(findTechnicalTerms("请用 CSS Grid 排版").length > 0)
  assert.ok(findTechnicalTerms("用 localStorage 保存草稿").length > 0)
  assert.ok(findTechnicalTerms("宽度设为 36px").includes("px 尺寸"))
  assert.ok(TECH_TERMS.length >= 30)
  assert.deepEqual(findTechnicalTerms("点击标签切换内容，选中项下方有一条主色短线"), [])
})

test("T6 28 个效果预览文件存在且带高度上报", () => {
  for (const p of FRONTEND_PROMPTS) {
    const file = path.join(DEMO_DIR, p.demoFile)
    assert.ok(fs.existsSync(file), `${p.demoFile} 不存在`)
    const html = fs.readFileSync(file, "utf8")
    assert.match(html, /^<!doctype html>/i, `${p.demoFile} 不是完整页面`)
    assert.ok(html.includes("__demoHeight"), `${p.demoFile} 缺高度上报`)
    assert.ok(!html.includes("%%ENDSCRIPT%%"), `${p.demoFile} 占位符未还原`)
  }
})

test("T7 分类筛选 + 关键字筛选 + 叠加", () => {
  assert.equal(filterFrontendPrompts(FRONTEND_PROMPTS).length, 28)
  assert.equal(filterFrontendPrompts(FRONTEND_PROMPTS, { category: "date" }).length, 6)
  assert.equal(filterFrontendPrompts(FRONTEND_PROMPTS, { category: "ghost" }).length, 0)
  assert.ok(filterFrontendPrompts(FRONTEND_PROMPTS, { keyword: "日历" }).length >= 1)
  assert.equal(filterFrontendPrompts(FRONTEND_PROMPTS, { keyword: "  日历  " }).length, filterFrontendPrompts(FRONTEND_PROMPTS, { keyword: "日历" }).length)
  assert.equal(filterFrontendPrompts(FRONTEND_PROMPTS, { keyword: "不存在的功能名" }).length, 0)
  assert.equal(filterFrontendPrompts(FRONTEND_PROMPTS, { category: "basic", keyword: "开关" }).length, 1)
  assert.equal(filterFrontendPrompts(FRONTEND_PROMPTS, { category: "select", keyword: "开关" }).length, 0)
})

test("T8 getFrontendPrompt 按编号取卡片", () => {
  assert.equal(getFrontendPrompt("13")?.title, "项目详情标签页")
  assert.equal(getFrontendPrompt("99"), undefined)
})

let failed = 0
for (const t of tests) {
  try { t.fn(); console.log(`  PASS  ${t.name}`) }
  catch (e) { failed++; console.error(`  FAIL  ${t.name}\n${String(e)}`) }
}
console.log(`\n${tests.length - failed}/${tests.length} 通过`)
if (failed) process.exitCode = 1
