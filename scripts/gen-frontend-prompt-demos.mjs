/**
 * 从「AI前端项目-提示词教学页.html」抽取 28 段效果预览，生成站内静态页。
 *
 * 用法：node scripts/gen-frontend-prompt-demos.mjs [源 HTML 路径]
 * 默认源：D:/workbuddyWorkSpace/AI前端项目-提示词教学页.html（用户本地素材，不入库）
 * 产物：public/frontend-prompts/demo-01.html … demo-28.html
 *
 * 两件必要的转换：
 * 1. 源页把内层脚本的结束标签写成 %%ENDSCRIPT%%，否则外层 <script type="text/html">
 *    会被浏览器提前截断。生成独立页面后必须还原成真实闭合标签。
 * 2. 追加一段高度上报脚本（与源页 iframe 自适应同款）：详情弹框据此把 iframe
 *    撑到内容实际高度，展开折叠面板、弹出消息提示这类交互后也能跟着变。
 *
 * 生成的页面是「效果素材」，不是应用代码：它们自带完整样式与交互，
 * 与主应用的主题令牌刻意隔离（相当于一个浏览器预览窗口）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = process.argv[2] || 'D:/workbuddyWorkSpace/AI前端项目-提示词教学页.html'
const OUT = path.join(ROOT, 'public', 'frontend-prompts')

const PROBE = [
  '<script>(function(){',
  "function report(){try{var b=document.body,c=getComputedStyle(b),h=b.scrollHeight+(parseFloat(c.marginTop)||0)+(parseFloat(c.marginBottom)||0),mx=0;",
  'b.querySelectorAll("*").forEach(function(el){var r=el.getBoundingClientRect();',
  'if(r.height<=0||r.bottom<=h)return;var st=getComputedStyle(el);',
  'if((st.position==="absolute"||st.position==="fixed")&&st.display!=="none"&&r.bottom>mx)mx=r.bottom;});',
  'if(mx>h)h=mx;parent.postMessage({__demoHeight:true,id:"fp",height:h},"*");}catch(e){}}',
  'var t=0;function later(){clearTimeout(t);t=setTimeout(report,280);}',
  'if(window.ResizeObserver){try{new ResizeObserver(report).observe(document.body);}catch(e){}}',
  'if(window.MutationObserver){try{new MutationObserver(function(){report();later();}).observe(document.body,',
  '{childList:true,subtree:true,attributes:true,attributeFilter:["style","class","hidden"]});}catch(e){}}',
  'window.addEventListener("load",report);window.addEventListener("resize",report);',
  'window.addEventListener("message",function(e){if(e.data&&e.data.__askHeight)report();});',
  'report();})();</script>'
].join('')

const html = fs.readFileSync(SRC, 'utf8')
const re = /<script type="text\/html" class="demo-src" data-frame="f(\d+)">([\s\S]*?)<\/script>/g
const found = []
for (const m of html.matchAll(re)) {
  const n = Number(m[1])
  let body = m[2].trim().replace(/%%ENDSCRIPT%%/g, '</script>')
  const at = body.lastIndexOf('</body>')
  body = at >= 0 ? `${body.slice(0, at)}\n${PROBE}\n${body.slice(at)}` : `${body}\n${PROBE}`
  found.push({ n, body })
}

if (found.length !== 28) throw new Error(`预期 28 段效果预览，实际抽到 ${found.length} 段`)
const ids = found.map(f => f.n).sort((a, b) => a - b)
if (ids.some((n, i) => n !== i + 1)) throw new Error('效果预览编号不是 01..28：' + ids.join(','))

fs.mkdirSync(OUT, { recursive: true })
for (const f of found) {
  const file = `demo-${String(f.n).padStart(2, '0')}.html`
  if (!/^<!doctype html>/i.test(f.body)) throw new Error(`${file} 不是完整页面，抽取可能失败`)
  if (!f.body.includes('__demoHeight')) throw new Error(`${file} 缺少高度上报脚本`)
  fs.writeFileSync(path.join(OUT, file), f.body, 'utf8')
}
console.log(`已生成 ${found.length} 个效果预览 → ${OUT}`)
