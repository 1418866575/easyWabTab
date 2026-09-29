<script setup lang="ts">
/**
 * JSON / YAML / TOML 互转（纯前端实现）
 * 源格式自动检测，目标格式可切换；YAML 走 js-yaml，TOML 走自建解析器。
 */
import { computed, ref, watch } from 'vue'
import yaml from 'js-yaml'
import { parseToml, stringifyToml, detectFormat } from '../../core/toml'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

type Fmt = 'json' | 'yaml' | 'toml'

const input = ref('name = "easy-web-tab"\n\n[server]\nhost = "127.0.0.1"\nport = 8080\n')
const from = ref<Fmt>('toml')
const to = ref<Fmt>('json')
const autoDetect = ref(true)

useDirtyFlag(() => !!input.value.trim())
const { copy, save } = useToolActions()

watch(
  input,
  v => {
    if (autoDetect.value) from.value = detectFormat(v)
  },
  { immediate: true }
)

/** 任意格式 → JS 对象 */
function toObject(text: string, fmt: Fmt): { ok: boolean; value?: unknown; error?: string } {
  const s = (text || '').trim()
  if (!s) return { ok: false, error: '请输入内容' }
  try {
    if (fmt === 'json') return { ok: true, value: JSON.parse(s) }
    if (fmt === 'yaml') return { ok: true, value: yaml.load(s) }
    return { ok: true, value: parseToml(s) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** JS 对象 → 目标格式文本 */
function fromObject(value: unknown, fmt: Fmt): { ok: boolean; text?: string; error?: string } {
  try {
    if (fmt === 'json') return { ok: true, text: JSON.stringify(value, null, 2) }
    if (fmt === 'yaml') return { ok: true, text: yaml.dump(value, { indent: 2, lineWidth: 120 }) }
    const obj = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value }
    return { ok: true, text: stringifyToml(obj) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const parsed = computed(() => toObject(input.value, from.value))
const output = computed(() => {
  if (!parsed.value.ok) return { ok: false, text: '', error: parsed.value.error }
  return fromObject(parsed.value.value, to.value)
})

const FMT_LABEL: Record<Fmt, string> = { json: 'JSON', yaml: 'YAML', toml: 'TOML' }
const EXT: Record<Fmt, string> = { json: 'json', yaml: 'yaml', toml: 'toml' }

function swap() {
  const a = from.value
  from.value = to.value
  to.value = a
  if (output.value.ok && output.value.text) {
    input.value = output.value.text
    autoDetect.value = false
  }
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-toolbar">
        <span class="tu-label">源格式</span>
        <div class="tu-seg">
          <button
            v-for="f in (['json', 'yaml', 'toml'] as Fmt[])"
            :key="f"
            type="button"
            :class="{ 'is-on': from === f }"
            @click="from = f; autoDetect = false"
          >{{ FMT_LABEL[f] }}</button>
        </div>
        <button type="button" class="tu-check" :class="{ 'is-on': autoDetect }" @click="autoDetect = !autoDetect">
          自动检测
        </button>
      </div>

      <TuField label="源内容" :hint="autoDetect ? '输入变化时会按内容特征自动识别格式' : undefined">
        <textarea
          v-model="input"
          class="tu-textarea"
          rows="16"
          spellcheck="false"
          placeholder="粘贴 JSON / YAML / TOML 内容"
          data-testid="tb-modal-input"
        />
      </TuField>

      <p v-if="!parsed.ok" class="tu-alert">{{ FMT_LABEL[from] }} 解析失败：{{ parsed.error }}</p>
      <p v-else class="tu-alert ok">{{ FMT_LABEL[from] }} 解析成功</p>
    </div>

    <div>
      <div class="tu-toolbar">
        <span class="tu-label">目标格式</span>
        <div class="tu-seg">
          <button
            v-for="f in (['json', 'yaml', 'toml'] as Fmt[])"
            :key="f"
            type="button"
            :class="{ 'is-on': to === f }"
            @click="to = f"
          >{{ FMT_LABEL[f] }}</button>
        </div>
        <span class="tu-spacer" />
        <button type="button" class="tu-btn ghost" :disabled="!output.ok" @click="swap">结果写回左侧</button>
      </div>

      <TuOutput
        :title="`转换结果（${FMT_LABEL[to]}）`"
        :text="output.text || ''"
        :filename="`config.${EXT[to]}`"
        mime="text/plain;charset=utf-8"
        empty="左侧输入合法配置后显示转换结果"
      >
        <pre v-if="output.ok" class="tu-code">{{ output.text }}</pre>
        <p v-else class="tu-alert">转换失败：{{ output.error }}</p>
      </TuOutput>
    </div>

    <details class="tu-folding tu-span">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>默认开启「自动检测」，粘贴内容即可识别 JSON / YAML / TOML。</li>
          <li>切换目标格式即可实时得到转换结果，可点击「结果写回左侧」继续二次转换。</li>
          <li>TOML 由本项目自建解析器处理，支持表、表数组、注释与跨行数组。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-span { grid-column: 1 / -1; }
.tu-code {
  margin: 0;
  max-height: 380px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
