/**
 * 博客阅读器正文字号偏好回归测试。
 * 运行：node --experimental-strip-types scripts/test-blog-reader-font.ts
 */
import assert from 'node:assert/strict'
import {
  BLOG_READER_FONT_MIN,
  BLOG_READER_FONT_MAX,
  BLOG_READER_FONT_DEFAULT,
  BLOG_READER_FONT_KEY,
  clampReaderFontSize,
  changeReaderFontSize,
  readerFontSize,
  initBlogReaderFont
} from '../src/composables/blogReaderFont.ts'

let passed = 0
let failed = 0
function check(name: string, fn: () => void): void {
  try {
    fn()
    passed += 1
  } catch (e) {
    failed += 1
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

check('默认 18px，比主题基础 16px 大一档', () => assert.equal(BLOG_READER_FONT_DEFAULT, 18))
check('范围 15~22px 且默认在范围内', () => {
  assert.equal(BLOG_READER_FONT_MIN, 15)
  assert.equal(BLOG_READER_FONT_MAX, 22)
  assert.ok(BLOG_READER_FONT_DEFAULT > BLOG_READER_FONT_MIN && BLOG_READER_FONT_DEFAULT < BLOG_READER_FONT_MAX)
})
check('存储键是设备级偏好（不是云同步信封键）', () => assert.match(BLOG_READER_FONT_KEY, /^blog-reader-/))
check('clamp: 合法值原样保留', () => assert.equal(clampReaderFontSize(19), 19))
check('clamp: 字符串数值也能读（localStorage 存的是字符串）', () => assert.equal(clampReaderFontSize('20'), 20))
check('clamp: 低于下限收敛到 15', () => assert.equal(clampReaderFontSize(3), BLOG_READER_FONT_MIN))
check('clamp: 高于上限收敛到 22', () => assert.equal(clampReaderFontSize(99), BLOG_READER_FONT_MAX))
check('clamp: 小数四舍五入', () => assert.equal(clampReaderFontSize(17.6), 18))
check('clamp: 非法输入回落默认值', () => {
  for (const v of [null, undefined, '', 'abc', NaN, Infinity, {}, []]) {
    assert.equal(clampReaderFontSize(v), BLOG_READER_FONT_DEFAULT, `输入 ${String(v)}`)
  }
})
check('init 在无 localStorage 的 Node 环境不抛错', () => {
  assert.doesNotThrow(() => initBlogReaderFont())
})
check('change: +1 / -1 生效', () => {
  readerFontSize.value = 18
  assert.equal(changeReaderFontSize(1), 19)
  assert.equal(changeReaderFontSize(-1), 18)
})
check('change: 到上下限后不再越界', () => {
  readerFontSize.value = BLOG_READER_FONT_MAX
  assert.equal(changeReaderFontSize(1), BLOG_READER_FONT_MAX)
  readerFontSize.value = BLOG_READER_FONT_MIN
  assert.equal(changeReaderFontSize(-1), BLOG_READER_FONT_MIN)
})
check('change: 非法 delta 按 0 处理', () => {
  readerFontSize.value = 18
  assert.equal(changeReaderFontSize(NaN), 18)
})

console.log(`\n[test-blog-reader-font] ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
