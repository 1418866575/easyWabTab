/**
 * HTML 编辑器纯逻辑：把 HTML / CSS / JS 三段拼成一个可在 iframe 中运行的文档
 *
 * 安全约定：
 * - 预览用 `sandbox="allow-scripts"`（**不**加 allow-same-origin），脚本无法访问父页面
 * - 注入的错误捕获脚本把运行时异常回传给父窗口，避免错误静默
 */

export interface EditorSource {
  html: string
  css: string
  js: string
}

/** 与预览 iframe 约定的消息类型 */
export const PREVIEW_ERROR_TYPE = 'html-editor-error'

export function buildSandboxDoc(src: EditorSource): string {
  const css = src.css ? `<style>\n${src.css}\n</style>` : ''
  const closeTag = '<' + '/script>'
  const js = src.js
    ? `<script>\ntry {\n${src.js}\n} catch (e) {\nparent.postMessage({ type: ${JSON.stringify(PREVIEW_ERROR_TYPE)}, message: String(e && e.message || e) }, '*');\n}\n${closeTag}`
    : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${css}
</head>
<body>
${src.html}
${js}
</body>
</html>`
}

export interface EditorTemplate extends EditorSource {
  id: string
  name: string
}

export const TEMPLATES: EditorTemplate[] = [
  {
    id: 'blank',
    name: '空白',
    html: '<h1>你好，世界</h1>\n<p>开始编写你的页面。</p>',
    css: 'body {\n  font-family: system-ui, sans-serif;\n  padding: 24px;\n}',
    js: ''
  },
  {
    id: 'card',
    name: '卡片布局',
    html:
      '<div class="cards">\n  <div class="card">\n    <h3>卡片一</h3>\n    <p>卡片内容</p>\n  </div>\n  <div class="card">\n    <h3>卡片二</h3>\n    <p>卡片内容</p>\n  </div>\n</div>',
    css:
      '.cards { display: flex; gap: 12px; }\n.card {\n  padding: 16px;\n  border: 1px solid #ddd;\n  border-radius: 8px;\n  background: #fafafa;\n}',
    js: ''
  },
  {
    id: 'counter',
    name: '计数器（含 JS）',
    html: '<p>计数：<span id="n">0</span></p>\n<button id="btn">加一</button>',
    css: 'body { font-family: system-ui, sans-serif; padding: 24px; }\nbutton { padding: 6px 14px; }',
    js:
      'let n = 0;\ndocument.getElementById("btn").addEventListener("click", () => {\n  n += 1;\n  document.getElementById("n").textContent = String(n);\n});'
  }
]

/** 导出为完整的独立 HTML 文件（含内联样式与脚本，可直接双击打开） */
export function buildStandaloneHtml(src: EditorSource, title = 'html-editor'): string {
  const safeTitle = title.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
  return buildSandboxDoc(src).replace('<head>', `<head>\n<title>${safeTitle}</title>`)
}
