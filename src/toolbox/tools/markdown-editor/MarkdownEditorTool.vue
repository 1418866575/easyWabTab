<script setup lang="ts">
/**
 * Markdown 编辑与预览（纯前端实现）
 * markdown-it 渲染 + 自建白名单清洗后再展示，杜绝脚本注入。
 */
import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { sanitizeHtml } from '../../core/sanitize'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, readFileAsText } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const source = ref(
  '# 标题\n\n这是 **加粗** 与 `行内代码`。\n\n- 列表项 A\n- 列表项 B\n\n| 列1 | 列2 |\n| --- | --- |\n| a | b |\n\n```ts\nconst a = 1\n```\n\n> 引用文本\n'
)
const breaks = ref(true)
const linkify = ref(true)
const showRaw = ref(false)

useDirtyFlag(() => !!source.value.trim())
const { copy, save } = useToolActions()

const md = computed(() => new MarkdownIt({ html: true, linkify: linkify.value, breaks: breaks.value, typographer: false }))

const renderedHtml = computed(() => md.value.render(source.value))
/** 清洗后的 HTML：移除 script/iframe/on* 事件与 javascript: 协议 */
const safeHtml = computed(() => sanitizeHtml(renderedHtml.value))

const wordCount = computed(() => {
  const plain = source.value.replace(/[#>*`\-|]/g, ' ').trim()
  return plain ? plain.split(/\s+/).length : 0
})

async function onFiles(files: File[]) {
  source.value = await readFileAsText(files[0])
}

const HTML_SHELL = (body: string, title: string) =>
  `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${title}</title>\n<style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;line-height:1.75;max-width:820px;margin:32px auto;padding:0 16px}pre{background:#f5f5f5;padding:12px;overflow:auto}table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 10px}code{background:#f5f5f5;padding:2px 4px}</style>\n</head>\n<body>\n${body}\n</body>\n</html>`
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-toolbar">
        <button type="button" class="tu-check" :class="{ 'is-on': breaks }" @click="breaks = !breaks">换行转 br</button>
        <button type="button" class="tu-check" :class="{ 'is-on': linkify }" @click="linkify = !linkify">
          自动识别链接
        </button>
        <span class="tu-spacer" />
        <span class="tu-hint">{{ source.length }} 字符 / 约 {{ wordCount }} 词</span>
      </div>

      <TuField label="Markdown 源码">
        <textarea
          v-model="source"
          class="tu-textarea"
          rows="18"
          spellcheck="false"
          placeholder="在此编写 Markdown"
          data-testid="tb-modal-input"
        />
        <TuDrop accept=".md,.markdown,.txt,text/markdown" hint="导入 Markdown 文件" @files="onFiles" />
      </TuField>
    </div>

    <div>
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': !showRaw }" @click="showRaw = false">预览</button>
          <button type="button" :class="{ 'is-on': showRaw }" @click="showRaw = true">HTML 源码</button>
        </div>
      </div>

      <TuOutput
        title="渲染结果"
        :text="safeHtml"
        filename="document.html"
        mime="text/html;charset=utf-8"
        empty="暂无内容"
      >
        <template #actions>
          <button
            type="button"
            class="tu-btn ghost"
            @click="save('document.html', HTML_SHELL(safeHtml, 'Markdown 导出'), 'text/html;charset=utf-8')"
          >导出完整 HTML</button>
          <button type="button" class="tu-btn ghost" @click="copy(safeHtml)">复制 HTML</button>
        </template>
        <div v-if="!showRaw" class="tu-md" v-html="safeHtml" />
        <pre v-else class="tu-code">{{ safeHtml }}</pre>
      </TuOutput>

      <div class="tu-row">
        <button type="button" class="tu-btn ghost" @click="copy(source)">复制源码</button>
        <button type="button" class="tu-btn ghost" @click="save('document.md', source, 'text/markdown;charset=utf-8')">
          下载 Markdown
        </button>
      </div>
    </div>

    <details class="tu-folding tu-span">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>左侧编写 Markdown，右侧实时预览；支持表格、代码块、引用等 GFM 常用语法。</li>
          <li>渲染结果经白名单清洗，脚本、iframe 与事件属性会被移除，可安全展示。</li>
          <li>「导出完整 HTML」会输出带基础样式的独立文档。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-span { grid-column: 1 / -1; }
.tu-md {
  max-height: 420px;
  overflow: auto;
  font-size: 13.5px;
  line-height: 1.75;
}
.tu-md :deep(h1) { font-size: 20px; margin: 12px 0 8px; }
.tu-md :deep(h2) { font-size: 17px; margin: 12px 0 8px; }
.tu-md :deep(h3) { font-size: 15px; margin: 10px 0 6px; }
.tu-md :deep(p) { margin: 8px 0; }
.tu-md :deep(pre) {
  background: var(--color-bg-input);
  padding: 10px;
  border-radius: var(--radius-md);
  overflow: auto;
}
.tu-md :deep(code) { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-md :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--color-primary);
  color: var(--color-text-secondary);
}
.tu-md :deep(table) { border-collapse: collapse; }
.tu-md :deep(th),
.tu-md :deep(td) { border: 1px solid var(--color-border); padding: 5px 10px; }
.tu-md :deep(ul),
.tu-md :deep(ol) { padding-left: 22px; }
.tu-code {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
