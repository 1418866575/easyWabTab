<script setup lang="ts">
/**
 * HTML 转 PDF（纯前端，零依赖）
 * 把用户提供的 HTML 片段写入隐藏 iframe 的 srcdoc，调用浏览器原生打印管线，
 * 在打印对话框中选择“另存为 PDF”即可生成。无需上传、无需第三方库。
 * 限制：依赖浏览器打印质量；跨域图片/外链样式可能不加载；复杂布局以打印视图为准。
 */
import { ref } from 'vue'

const input = ref(
  '<h1>示例标题</h1>\n<p>这是一段<strong>示例</strong>文本，下面是一张表：</p>\n<table>\n  <tr><th>名称</th><th>数量</th></tr>\n  <tr><td>苹果</td><td>3</td></tr>\n  <tr><td>香蕉</td><td>5</td></tr>\n</table>'
)
const errorMsg = ref('')

function generate() {
  errorMsg.value = ''
  const html = input.value
  if (!html.trim()) {
    errorMsg.value = '请输入 HTML 内容'
    return
  }
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { margin: 16mm; }
*,*::before,*::after { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; line-height: 1.6; color: #222; margin: 0; }
h1,h2,h3 { break-after: avoid; }
img { max-width: 100%; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
pre { background: #f5f5f5; padding: 10px; border-radius: 6px; white-space: pre-wrap; }
a { color: #1a73e8; }
</style></head><body>${html}</body></html>`
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (e) {
      errorMsg.value = '调用打印失败：' + (e as Error).message
    } finally {
      setTimeout(() => iframe.remove(), 1500)
    }
  }
  iframe.srcdoc = doc
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-field">
      <label class="tu-label">HTML 内容（支持标签与内联样式，图片可用 base64 或同源/可访问 URL）</label>
      <textarea v-model="input" class="tu-textarea" style="min-height: 320px" />
    </div>
    <button type="button" class="tu-btn" @click="generate">生成 PDF（浏览器打印）</button>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <p class="tu-hint">
      点击后浏览器会弹出打印对话框，在“目标打印机”处选择「另存为 PDF / Save as PDF」即可。
      该方式零依赖、不联网（除你引用的外部资源）。复杂版式以打印视图为准，分页由浏览器控制。
    </p>
  </div>
</template>
