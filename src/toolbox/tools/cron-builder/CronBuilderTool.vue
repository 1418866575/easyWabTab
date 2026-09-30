<script setup lang="ts">
/**
 * Cron 表达式生成器（纯前端实现）
 * 可视化选择各字段 → 实时拼装表达式 → 复制 / 验证 / 查看未来执行时间
 */
import { computed, reactive, ref } from 'vue'
import {
  CRON_BUILDER_FIELDS,
  CRON_TEMPLATES,
  buildCron,
  humanizeCron,
  nextExecutions,
  type CronFieldKey
} from '../../core/cron'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

type FieldState = { preset: string; custom: string }

/** 自定义选项的哨兵值（与下拉里的「自定义…」对应） */
const CUSTOM = '__custom'

const state = reactive<Record<CronFieldKey, FieldState>>({
  minute: { preset: '*', custom: '' },
  hour: { preset: '*', custom: '' },
  day: { preset: '*', custom: '' },
  month: { preset: '*', custom: '' },
  weekday: { preset: '*', custom: '' }
})
const count = ref(10)

/** 字段取值：自定义模式下取输入值（空则回退为星号） */
function valueOf(key: CronFieldKey): string {
  const s = state[key]
  if (s.preset === CUSTOM) return s.custom.trim() || '*'
  return s.preset || '*'
}

const parts = computed<Record<CronFieldKey, string>>(() => ({
  minute: valueOf('minute'),
  hour: valueOf('hour'),
  day: valueOf('day'),
  month: valueOf('month'),
  weekday: valueOf('weekday')
}))

const built = computed(() => buildCron(parts.value))
const description = computed(() => (built.value.ok ? humanizeCron(built.value.expr) : ''))
const runs = computed(() =>
  built.value.ok ? nextExecutions(built.value.expr, Math.max(1, Math.min(count.value, 50))) : []
)

useDirtyFlag(() => built.value.expr !== '* * * * *')
const { copy } = useToolActions()

function useTemplate(t: (typeof CRON_TEMPLATES)[number]) {
  ;(Object.keys(t.parts) as CronFieldKey[]).forEach(k => {
    const v = t.parts[k]
    const known = CRON_BUILDER_FIELDS.find(f => f.key === k)!.options.some(o => o.value === v)
    state[k].preset = known ? v : CUSTOM
    state[k].custom = known ? '' : v
  })
}

function reset() {
  ;(Object.keys(state) as CronFieldKey[]).forEach(k => {
    state[k].preset = '*'
    state[k].custom = ''
  })
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <span class="tu-label">常用模板</span>
      <button v-for="t in CRON_TEMPLATES" :key="t.text" type="button" class="tu-btn ghost" @click="useTemplate(t)">
        {{ t.text }}
      </button>
      <button type="button" class="tu-btn ghost" @click="reset">重置</button>
    </div>

    <div class="tu-grid cb-grid">
      <div v-for="f in CRON_BUILDER_FIELDS" :key="f.key" class="cb-field">
        <TuField :label="`${f.name} (${f.min}-${f.max})`">
          <select v-model="state[f.key].preset" class="tu-select">
            <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
            <option :value="CUSTOM">自定义…</option>
          </select>
          <input
            v-if="state[f.key].preset === CUSTOM"
            v-model="state[f.key].custom"
            class="tu-input"
            spellcheck="false"
            :placeholder="f.placeholder"
          />
        </TuField>
      </div>
    </div>

    <TuField label="生成的表达式" :extra="built.ok ? '5 段（分 时 日 月 周）' : '待修正'">
      <div class="tu-row">
        <code class="cb-expr" :class="{ 'is-error': !built.ok }">{{ built.expr }}</code>
        <button type="button" class="tu-btn ghost" :disabled="!built.ok" @click="copy(built.expr, '已复制 Cron 表达式')">
          复制表达式
        </button>
      </div>
    </TuField>

    <p v-if="!built.ok" class="tu-alert">
      {{ built.error }}
    </p>
    <p v-else class="tu-alert ok">{{ description }}</p>

    <TuField label="未来执行时间">
      <div class="tu-row">
        <span class="tu-label">生成条数</span>
        <input
          v-model.number="count"
          type="number"
          min="1"
          max="50"
          class="tu-input tu-inline"
          style="max-width: 100px"
        />
      </div>
    </TuField>

    <TuOutput
      title="执行时间预览"
      :text="runs.join('\n')"
      filename="cron-next.txt"
      empty="表达式有效后显示未来执行时间"
    >
      <ol v-if="runs.length" class="tu-list">
        <li v-for="(n, i) in runs" :key="i" class="tu-mono">{{ i + 1 }}. {{ n }}</li>
      </ol>
      <p v-else class="tu-out-empty">表达式有误或无法在合理范围内找到匹配时间</p>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>每个字段既可从下拉选择常用值，也可选「自定义…」手写表达式片段。</li>
          <li>
            支持 <code>*</code>、<code>*/n</code>、<code>a</code>、<code>a-b</code>、<code>a-b/n</code>、
            <code>a,b,c</code>，以及扩展语法 <code>L</code>（最后一天）、<code>L-n</code>、<code>nW</code>、
            <code>LW</code>、<code>nL</code>（当月最后一个星期 n）、<code>n#m</code>（第 m 个星期 n）、
            <code>?</code>。
          </li>
          <li>「日」与「星期」同时指定时按“或”关系匹配（与标准 cron 一致）。</li>
          <li>执行时间基于浏览器本地时区计算，最多迭代 1 年内的匹配点。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.cb-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.cb-field { min-width: 0; }
.cb-expr {
  flex: 1;
  padding: 8px 10px;
  font-family: var(--font-family-mono);
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--color-text);
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  word-break: break-all;
}
.cb-expr.is-error { color: var(--color-error); border-color: var(--color-error); }
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8; }
</style>
