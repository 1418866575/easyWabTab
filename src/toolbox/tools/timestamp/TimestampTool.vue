<script setup lang="ts">
/**
 * 时间戳转换（秒 / 毫秒 ↔ 日期，支持批量）
 */
import { computed, ref } from 'vue'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const input = ref(String(Math.floor(Date.now() / 1000)))
const unit = ref<'auto' | 's' | 'ms'>('auto')
const dateInput = ref('')
const batchInput = ref('')
const now = ref(Date.now())

useDirtyFlag(() => !!input.value.trim() || !!batchInput.value.trim())
const { copy } = useToolActions()

const p2 = (n: number) => String(n).padStart(2, '0')

function fmtLocal(d: Date): string {
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  )
}

/** 识别 10 位（秒）/ 13 位（毫秒）时间戳或常见日期字符串 */
function parseInput(): { ok: boolean; date: Date | null; kind: string; error?: string } {
  const s = input.value.trim()
  if (!s) return { ok: false, date: null, kind: '', error: '请输入时间戳或日期' }
  if (/^\d+$/.test(s)) {
    if (unit.value === 's' || (unit.value === 'auto' && s.length <= 10)) {
      return { ok: true, date: new Date(Number(s) * 1000), kind: '秒级时间戳' }
    }
    return { ok: true, date: new Date(Number(s)), kind: '毫秒级时间戳' }
  }
  const d = new Date(s.replace(/-/g, '/'))
  return Number.isNaN(d.getTime())
    ? { ok: false, date: null, kind: '', error: '无法识别，请输入 10/13 位数字时间戳或常见日期字符串' }
    : { ok: true, date: d, kind: '日期字符串' }
}

const parsed = computed(() => parseInput())

const resultText = computed(() => {
  const p = parsed.value
  if (!p.ok || !p.date) return p.error || ''
  const d = p.date
  return [
    `识别类型：${p.kind}`,
    `本地时间：${fmtLocal(d)}`,
    `ISO 8601：${d.toISOString()}`,
    `UTC：${d.toUTCString()}`,
    `秒级时间戳：${Math.floor(d.getTime() / 1000)}`,
    `毫秒时间戳：${d.getTime()}`,
    `星期：${'日一二三四五六'[d.getDay()]}`,
    `相对现在：${relative(d.getTime())}`
  ].join('\n')
})

function relative(ts: number): string {
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const day = Math.floor(abs / 86400000)
  const hour = Math.floor((abs % 86400000) / 3600000)
  const min = Math.floor((abs % 3600000) / 60000)
  const tail = day > 0 ? `${day} 天 ${hour} 小时` : hour > 0 ? `${hour} 小时 ${min} 分` : `${min} 分钟`
  return diff >= 0 ? `${tail}后` : `${tail}前`
}

/** 日期 → 时间戳 */
const dateToTs = computed(() => {
  const s = dateInput.value.trim()
  if (!s) return ''
  const d = new Date(s.replace(/-/g, '/'))
  if (Number.isNaN(d.getTime())) return '日期格式无法识别'
  return `秒级：${Math.floor(d.getTime() / 1000)}\n毫秒：${d.getTime()}`
})

/** 批量转换（每行一个） */
const batchResult = computed(() => {
  const lines = batchInput.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  if (!lines.length) return ''
  return lines
    .map(line => {
      if (/^\d+$/.test(line)) {
        const isSec = unit.value === 's' || (unit.value === 'auto' && line.length <= 10)
        const d = new Date(isSec ? Number(line) * 1000 : Number(line))
        return Number.isNaN(d.getTime()) ? `${line}\t无法解析` : `${line}\t${fmtLocal(d)}`
      }
      const d = new Date(line.replace(/-/g, '/'))
      return Number.isNaN(d.getTime())
        ? `${line}\t无法解析`
        : `${line}\t${Math.floor(d.getTime() / 1000)} / ${d.getTime()}`
    })
    .join('\n')
})

function refreshNow() {
  now.value = Date.now()
}

function useNow() {
  refreshNow()
  input.value = String(Math.floor(now.value / 1000))
}

const nowText = computed(() => {
  const d = new Date(now.value)
  return `本地时间 ${fmtLocal(d)} · 秒 ${Math.floor(now.value / 1000)} · 毫秒 ${now.value}`
})
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="当前时间">
        <p class="tu-mono">{{ nowText }}</p>
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="refreshNow">刷新</button>
          <button type="button" class="tu-btn ghost" @click="useNow">填入输入框</button>
        </div>
      </TuField>

      <TuField label="时间戳或日期">
        <input v-model="input" class="tu-input" spellcheck="false" placeholder="1700000000 或 2026-09-30 10:00:00" data-testid="tb-modal-input" />
        <div class="tu-row">
          <span class="tu-label">单位</span>
          <div class="tu-seg">
            <button type="button" :class="{ 'is-on': unit === 'auto' }" @click="unit = 'auto'">自动</button>
            <button type="button" :class="{ 'is-on': unit === 's' }" @click="unit = 's'">秒</button>
            <button type="button" :class="{ 'is-on': unit === 'ms' }" @click="unit = 'ms'">毫秒</button>
          </div>
        </div>
      </TuField>

      <TuField label="日期 → 时间戳">
        <input v-model="dateInput" class="tu-input" placeholder="2026-09-30 10:00:00" />
      </TuField>

      <TuField label="批量转换（每行一条）">
        <textarea v-model="batchInput" class="tu-textarea" rows="5" spellcheck="false" placeholder="1700000000&#10;2026-09-30 10:00:00" />
      </TuField>
    </div>

    <div>
      <TuOutput
        title="转换结果"
        :text="resultText"
        filename="timestamp.txt"
        empty="输入时间戳或日期"
      >
        <pre class="tu-code">{{ resultText }}</pre>
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!resultText" @click="copy(resultText)">复制</button>
        </template>
      </TuOutput>

      <TuOutput v-if="dateToTs" title="日期 → 时间戳" :text="dateToTs" filename="ts.txt" empty="—">
        <pre class="tu-code">{{ dateToTs }}</pre>
      </TuOutput>

      <TuOutput
        v-if="batchResult"
        title="批量结果（原值 → 结果）"
        :text="batchResult"
        filename="batch-timestamp.txt"
        empty="—"
      >
        <pre class="tu-code">{{ batchResult }}</pre>
      </TuOutput>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>10 位数字默认按秒解析，13 位按毫秒；也可手动指定单位。</li>
            <li>支持 <code>2026-09-30 10:00:00</code> 等常见日期字符串作为输入。</li>
            <li>批量区每行一条，混合时间戳与日期也能逐行转换。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-code {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
