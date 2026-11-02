<script setup lang="ts">
/**
 * HTML 编辑器：HTML / CSS / JS 三栏编辑 + iframe 沙箱实时预览
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildStandaloneHtml, PREVIEW_ERROR_TYPE, TEMPLATES } from './htmlEditorCore'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'

const html = ref(TEMPLATES[0].html)
const css = ref(TEMPLATES[0].css)
const js = ref(TEMPLATES[0].js)
const runtimeError = ref('')
const previewKey = ref(0)

useDirtyFlag(() => !!html.value || !!css.value || !!js.value)
const { copy, save } = useToolActions()

let timer: ReturnType<typeof setTimeout> | null = null
const doc = ref('')

function rebuild() {
  doc.value = buildStandaloneHtml({ html: html.value, css: css.value, js: js.value })
  runtimeError.value = ''
  previewKey.value++
}

watch([html, css, js], () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(rebuild, 300)
})

function onMessage(e: MessageEvent) {
  const data = e.data as { type?: string; message?: string } | null
  if (data?.type === PREVIEW_ERROR_TYPE) runtimeError.value = data.message ?? '脚本运行出错'
}

onMounted(() => {
  rebuild()
  window.addEventListener('message', onMessage)
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  if (timer) clearTimeout(timer)
})

function applyTemplate(id: string) {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t) return
  html.value = t.html
  css.value = t.css
  js.value = t.js
}

const fullSource = computed(() => buildStandaloneHtml({ html: html.value, css: css.value, js: js.value }))
</script>

<template>
  <div class="tu-t2 he-wrap">
    <div class="he-editors">
      <div class="tu-toolbar">
        <span class="tu-hint he-inline">模板</span>
        <button v-for="t in TEMPLATES" :key="t.id" type="button" class="tu-btn ghost he-tpl" @click="applyTemplate(t.id)">
          {{ t.name }}
        </button>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost" @click="copy(fullSource)">复制源码</button>
        <button type="button" class="tu-btn ghost" @click="save('page.html', fullSource, 'text/html')">下载 HTML</button>
      </div>

      <label class="tu-label">HTML</label>
      <textarea v-model="html" class="tu-textarea he-area" rows="8" spellcheck="false"></textarea>
      <label class="tu-label">CSS</label>
      <textarea v-model="css" class="tu-textarea he-area" rows="6" spellcheck="false"></textarea>
      <label class="tu-label">JavaScript</label>
      <textarea v-model="js" class="tu-textarea he-area" rows="6" spellcheck="false"></textarea>
    </div>

    <div class="he-preview">
      <div class="tu-toolbar">
        <span class="tu-hint he-inline">预览（沙箱运行，无法访问本站数据）</span>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost" @click="rebuild">重新渲染</button>
      </div>
      <p v-if="runtimeError" class="tu-alert">脚本错误：{{ runtimeError }}</p>
      <iframe
        :key="previewKey"
        class="he-frame"
        title="预览"
        sandbox="allow-scripts allow-forms allow-modals"
        :srcdoc="doc"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.he-wrap { align-items: start; }
.he-editors, .he-preview { min-width: 0; display: flex; flex-direction: column; }
.he-area { font-family: var(--font-family-mono); font-size: 12.5px; margin-bottom: 10px; }
.he-tpl { min-height: 28px; padding: 3px 10px; font-size: 12px; }
.he-inline { margin-bottom: 0; }
.he-frame {
  width: 100%;
  height: 420px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: #fff;
}
</style>
