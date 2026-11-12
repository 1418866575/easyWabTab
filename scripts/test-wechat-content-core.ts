/**
 * 公众号草稿箱正文自检（wechatContentCore）回归测试。
 * 运行：node --experimental-strip-types scripts/test-wechat-content-core.ts
 */
import assert from 'node:assert/strict'
import {
  validateWechatArticle,
  formatWechatContentIssues,
  collectImageSources,
  isWxImageUrl,
  WX_TITLE_MAX,
  WX_AUTHOR_MAX,
  WX_DIGEST_MAX,
  WX_CONTENT_MAX_CHARS,
  WX_CONTENT_MAX_BYTES
} from '../src/composables/wechatContentCore.ts'

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

const OK = {
  title: '一篇正常的文章标题',
  author: '司福江',
  digest: '摘要',
  content: '<section><p>正文</p><img src="https://mmbiz.qpic.cn/mmbiz_jpg/abc/640?wx_fmt=jpeg"></section>'
}
const messages = (a: Parameters<typeof validateWechatArticle>[0]) =>
  validateWechatArticle(a).map((i) => i.message).join(' | ')

check('合法文章零违规', () => assert.equal(validateWechatArticle(OK).length, 0))
check('http 微信图床也认', () => {
  assert.equal(validateWechatArticle({ ...OK, content: '<img src="http://mmbiz.qpic.cn/a/0">' }).length, 0)
})
check('微信图床子域名也认', () => assert.equal(isWxImageUrl('https://img.mmbiz.qpic.cn/a/0'), true))
check('外链图被拦下并给出数量', () => {
  const m = messages({ ...OK, content: '<img src="https://example.com/a.png"><img src="https://cdn.example.org/b.jpg">' })
  assert.match(m, /2 张图片不是微信图床/)
  assert.match(m, /example\.com/)
})
check('data: 图片未被上传完会被拦下', () => {
  assert.match(messages({ ...OK, content: '<img src="data:image/png;base64,iVBORw0KGgo=">' }), /不是微信图床/)
})
check('相对路径图片被拦下', () => {
  assert.match(messages({ ...OK, content: '<img src="/images/a.png">' }), /不是微信图床/)
})
check('标题恰好 32 字放行', () => {
  assert.equal(validateWechatArticle({ ...OK, title: '标'.repeat(WX_TITLE_MAX) }).length, 0)
})
check('标题 33 字被拦下', () => {
  assert.match(messages({ ...OK, title: '标'.repeat(WX_TITLE_MAX + 1) }), /超过微信上限 32 字/)
})
check('emoji 按码点算字，不误判成双字', () => {
  assert.equal(validateWechatArticle({ ...OK, title: '😀'.repeat(WX_TITLE_MAX) }).length, 0)
  assert.match(messages({ ...OK, title: '😀'.repeat(WX_TITLE_MAX + 1) }), /33 字/)
})
check('作者 / 摘要超限被拦下', () => {
  const m = messages({ ...OK, author: 'a'.repeat(WX_AUTHOR_MAX + 1), digest: 'b'.repeat(WX_DIGEST_MAX + 1) })
  assert.match(m, /作者 17 字/)
  assert.match(m, /摘要 121 字/)
})
check('标题为空被拦下', () => assert.match(messages({ ...OK, title: '' }), /标题为空/))
check('正文为空被拦下', () => assert.match(messages({ ...OK, content: '' }), /正文内容为空/))
check('正文达到 2 万字符被拦下', () => {
  const m = messages({ ...OK, content: '文'.repeat(WX_CONTENT_MAX_CHARS) })
  assert.match(m, /20000 字符/)
  assert.match(m, /2 万字符、1MB/)
})
check('正文按 UTF-8 字节算 1MB 上限', () => {
  assert.ok(WX_CONTENT_MAX_BYTES === 1024 * 1024)
  assert.match(messages({ ...OK, content: 'a'.repeat(WX_CONTENT_MAX_BYTES) }), /已达微信上限/)
})
check('script / javascript: / 事件属性被拦下', () => {
  assert.match(messages({ ...OK, content: '<script>alert(1)</script>' }), /含 script/)
  assert.match(messages({ ...OK, content: '<a href="javascript:alert(1)">x</a>' }), /含 script/)
  assert.match(messages({ ...OK, content: '<p onclick="x()">x</p>' }), /含 script/)
})
check('collectImageSources 只取 src，不误取 data-src', () => {
  assert.deepEqual(collectImageSources('<img data-src="https://evil.com/a.png" src="https://mmbiz.qpic.cn/x/0">'), [
    'https://mmbiz.qpic.cn/x/0'
  ])
})
check('collectImageSources 兼容单引号 / 无引号', () => {
  assert.deepEqual(collectImageSources("<img src='a.png'><img src=b.png>"), ['a.png', 'b.png'])
})
check('isWxImageUrl 拒绝外链与非法 URL', () => {
  assert.equal(isWxImageUrl('https://example.com/a.png'), false)
  assert.equal(isWxImageUrl('data:image/png;base64,AAA'), false)
  assert.equal(isWxImageUrl('not-a-url'), false)
})
check('formatWechatContentIssues 空数组返回空串', () => assert.equal(formatWechatContentIssues([]), ''))
check('formatWechatContentIssues 输出编号中文清单', () => {
  const s = formatWechatContentIssues(validateWechatArticle({ ...OK, title: '' }))
  assert.match(s, /正文未通过微信公众号草稿箱自检/)
  assert.match(s, /1\. 标题为空/)
})

console.log(`\n[test-wechat-content-core] ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
