<script setup lang="ts">
/**
 * 正则表达式测试（纯前端实现）
 */
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'

interface MatchItem { index: number; text: string }

const pattern = ref('\\d{4}-\\d{2}-\\d{2}')
const flags = ref('g')
const text = ref('今天是 2026-09-29，明天是 2026-09-30。')
const errorMsg = ref('')
const matches = ref<MatchItem[]>([])
const total = ref(0)
const { success, error } = useToast()

function run() {
  errorMsg.value = ''
  matches.value = []
  total.value = 0
  let re: RegExp
  try {
    re = new RegExp(pattern.value, flags.value || '')
  } catch (e) {
    errorMsg.value = '正则不合法：' + (e instanceof Error ? e.message : String(e))
    return
  }
  const src = text.value
  const res: MatchItem[] = []
  if (re.global) {
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      res.push({ index: m.index, text: m[0] })
      if (m[0] === '') re.lastIndex++
      if (res.length >= 500) break
    }
  } else {
    const m = re.exec(src)
    if (m) res.push({ index: m.index, text: m[0] })
  }
  total.value = res.length
  matches.value = res.slice(0, 50)
}

async function copy() {
  if (!matches.value.length) { error('暂无可复制内容'); return }
  try {
    await navigator.clipboard.writeText(matches.value.map(m => m.text).join('\n'))
    success('已复制匹配结果')
  } catch {
    error('复制失败，请手动选择结果复制')
  }
}
</script>

<template>
  <div>
    <div class="tu-field">
      <label class="tu-label" for="re-pattern">正则表达式</label>
      <input id="re-pattern" v-model="pattern" class="tu-input" placeholder="如 \d{4}-\d{2}-\d{2}" />
    </div>

    <div class="tu-row">
      <span class="tu-label">flags</span>
      <input v-model="flags" class="tu-input tu-inline" style="max-width:110px" placeholder="g" />
    </div>

    <div class="tu-field">
      <label class="tu-label" for="re-text">测试文本</label>
      <textarea id="re-text" v-model="text" class="tu-textarea" placeholder="在此粘贴待匹配的文本…" />
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" @click="run">测试</button>
      <button type="button" class="tu-btn ghost" @click="copy">复制结果</button>
    </div>

    <div class="tu-field">
      <span class="tu-label">匹配结果</span>
      <div class="tu-out" data-testid="tool-regex-output">
        <template v-if="errorMsg"><span class="tu-error">{{ errorMsg }}</span></template>
        <template v-else-if="!total">没有匹配结果</template>
        <template v-else>
          <div>共匹配 {{ total }} 处：</div>
          <div v-for="(m, i) in matches" :key="i">
            · <mark class="re-hit">{{ m.text }}</mark>（位置 {{ m.index }}）
          </div>
          <div v-if="total > matches.length" class="tu-hint">仅展示前 50 条</div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.re-hit {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-radius: 3px;
  padding: 0 1px;
}
</style>
