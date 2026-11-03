<script setup lang="ts">
/**
 * 随机数据生成器：占位符模板 → 批量逼真假数据 → 导出 JSON
 */
import { computed, ref } from 'vue'
import { generate, MAX_COUNT, PLACEHOLDERS, SCHEMA_SAMPLE } from './mockCore'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'

const schema = ref(SCHEMA_SAMPLE)
const count = ref(10)
const seedText = ref('')
const rows = ref<unknown[]>([])
const error = ref('')
const view = ref<'table' | 'json'>('table')

const { copy, save } = useToolActions()

const jsonText = computed(() => JSON.stringify(rows.value, null, 2))

function run() {
  error.value = ''
  rows.value = []
  try {
    const seed = seedText.value.trim() === '' ? undefined : Number(seedText.value)
    if (seedText.value.trim() !== '' && !Number.isFinite(seed)) {
      error.value = '随机种子需为数字（留空则每次随机）'
      return
    }
    rows.value = generate(schema.value, count.value, seed)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '生成失败'
  }
}

const columns = computed<string[]>(() => {
  const first = rows.value.find((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown> | undefined
  return first ? Object.keys(first) : []
})

function cell(row: unknown, key: string): string {
  const v = (row as Record<string, unknown>)?.[key]
  if (v === null || v === undefined) return '—'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

run()
</script>

<template>
  <div class="tu-t1">
    <TuField label="JSON 模板（含占位符）" hint="字符串里可混用占位符，如 &quot;用户-@word-@int(1,99)&quot;">
      <textarea v-model="schema" class="tu-textarea md-area" rows="10" spellcheck="false"></textarea>
    </TuField>

    <div class="tu-row">
      <label class="tu-label md-inline">条数</label>
      <input v-model.number="count" type="number" class="tu-input md-num" min="1" :max="MAX_COUNT" />
      <label class="tu-label md-inline">种子（可复现）</label>
      <input v-model="seedText" type="text" class="tu-input md-seed" placeholder="留空随机" />
      <button type="button" class="tu-btn" @click="run">生成</button>
      <template v-if="rows.length">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': view === 'table' }" @click="view = 'table'">表格</button>
          <button type="button" :class="{ 'is-on': view === 'json' }" @click="view = 'json'">JSON</button>
        </div>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost" @click="copy(jsonText)">复制 JSON</button>
        <button type="button" class="tu-btn ghost" @click="save('mock-data.json', jsonText, 'application/json')">下载</button>
      </template>
    </div>

    <p v-if="error" class="tu-alert">{{ error }}</p>

    <div class="tu-folding">
      <summary>可用占位符（{{ PLACEHOLDERS.length }} 种）</summary>
      <div class="tu-folding-body md-phs">
        <span v-for="p in PLACEHOLDERS" :key="p.token" class="md-ph"><code>{{ p.token }}</code> {{ p.desc }}</span>
      </div>
    </div>

    <div v-if="rows.length && view === 'table' && columns.length" class="tu-table-wrap">
      <table class="tu-table">
        <thead>
          <tr><th class="md-idx">#</th><th v-for="c in columns" :key="c">{{ c }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td class="md-idx">{{ i + 1 }}</td>
            <td v-for="c in columns" :key="c" class="md-cell">{{ cell(r, c) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <pre v-else-if="rows.length" class="tu-out md-json">{{ jsonText }}</pre>

    <p class="tu-hint">同名种子 + 同一模板 = 完全相同的一批数据，便于复现测试场景；全部本地生成。</p>
  </div>
</template>

<style scoped>
.md-inline { margin-bottom: 0; }
.md-num { width: 90px; }
.md-seed { width: 140px; }
.md-area { font-family: var(--font-family-mono); font-size: 12.5px; }
.md-phs { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.md-ph code { font-family: var(--font-family-mono); color: var(--color-primary); margin-right: 4px; }
.md-idx { width: 48px; color: var(--color-text-muted); }
.md-cell { max-width: 260px; word-break: break-all; font-family: var(--font-family-mono); font-size: var(--fs-caption); }
.md-json { max-height: 320px; }
</style>
