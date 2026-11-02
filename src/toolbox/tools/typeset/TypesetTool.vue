<script setup lang="ts">
/**
 * 公众号排版：Markdown 实时预览 + 主题切换 + 复制带样式正文（内联样式，公众号可直接粘贴）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  normalizeDraft,
  renderWithTheme,
  THEMES,
  themeById
} from './typesetCore'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'
import TuField from '../../components/tool/TuField.vue'

const toast = useToast()
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const mdSource = ref('')
const themeId = ref(THEMES[0].id)
let draftTimer: ReturnType<typeof setTimeout> | null = null

const html = computed(() => renderWithTheme(mdSource.value, themeId.value, (s) => md.render(s)))
const theme = computed(() => themeById(themeId.value))

const DRAFT_ID = 'typeset'

async function loadDraft() {
  const raw = await loadToolData<unknown>(DRAFT_ID, null)
  const d = normalizeDraft(raw)
  if (d) {
    mdSource.value = d.md
    themeId.value = THEMES.some((t) => t.id === d.themeId) ? d.themeId : THEMES[0].id
  } else {
    mdSource.value = '# 你好，公众号\n\n用 **Markdown** 写正文，右侧实时预览。\n\n> 支持引用、列表、代码块\n\n- 主题可切换\n- 一键复制带样式正文'
    themeId.value = THEMES[0].id
  }
}

watch([mdSource, themeId], () => {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    void saveToolData(DRAFT_ID, { md: mdSource.value, themeId: themeId.value, ts: Date.now() })
  }, 600)
})

onMounted(loadDraft)
onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
})

/** 复制富文本（text/html + text/plain），公众号编辑器粘贴即得样式 */
async function copyRich() {
  const body = html.value
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([body], { type: 'text/html' }),
          'text/plain': new Blob([body], { type: 'text/plain' })
        })
      ])
    } else {
      await navigator.clipboard.writeText(body)
    }
    toast.success('已复制，粘贴到公众号编辑器即可')
  } catch {
    try {
      await navigator.clipboard.writeText(body)
      toast.warning('已复制 HTML 源码（当前浏览器不支持富文本复制）')
    } catch {
      toast.error('复制失败，请手动选择预览区内容复制')
    }
  }
}

function saveHtml() {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>公众号排版</title></head><body style="max-width:677px;margin:0 auto;padding:20px">${html.value}</body></html>`
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `typeset-${Date.now()}.html`
  a.click()
  URL.revokeObjectURL(a.href)
  toast.success('已下载 HTML 文件')
}
</script>

<template>
  <div class="tu-t2 ts-wrap">
    <div class="ts-left">
      <TuField label="Markdown 正文" hint="粘贴 Markdown，右侧实时预览；草稿自动保存在本机">
        <textarea v-model="mdSource" class="tu-textarea ts-area" rows="16" spellcheck="false"></textarea>
      </TuField>
      <TuField label="主题">
        <div class="tu-row ts-nomargin">
          <div class="tu-seg ts-segs">
            <button
              v-for="t in THEMES"
              :key="t.id"
              type="button"
              :class="{ 'is-on': themeId === t.id }"
              @click="themeId = t.id"
            >{{ t.name }}</button>
          </div>
        </div>
      </TuField>
      <div class="tu-row">
        <button type="button" class="tu-btn" @click="copyRich">复制带样式正文</button>
        <button type="button" class="tu-btn ghost" @click="saveHtml">下载 HTML</button>
      </div>
      <p class="tu-hint">样式已内联到每个标签，粘贴到公众号后台不会丢失；当前主题主色 {{ theme.primary }}。</p>
    </div>

    <div class="ts-right">
      <div class="tu-toolbar">
        <span class="tu-hint ts-inline">预览（{{ theme.name }}）</span>
      </div>
      <div class="ts-phone">
        <div class="ts-body" v-html="html"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts-wrap { align-items: start; }
.ts-left, .ts-right { min-width: 0; display: flex; flex-direction: column; }
.ts-area { font-family: var(--font-family-mono); font-size: 12.5px; }
.ts-nomargin { margin-bottom: 0; }
.ts-segs { flex-wrap: wrap; }
.ts-inline { margin-bottom: 0; }
.ts-phone {
  max-height: 520px;
  overflow: auto;
  padding: 16px;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.ts-body :deep(h1),
.ts-body :deep(h2),
.ts-body :deep(h3),
.ts-body :deep(p),
.ts-body :deep(blockquote),
.ts-body :deep(ul),
.ts-body :deep(ol),
.ts-body :deep(li),
.ts-body :deep(table),
.ts-body :deep(th),
.ts-body :deep(td) {
  word-break: break-word;
}
</style>
