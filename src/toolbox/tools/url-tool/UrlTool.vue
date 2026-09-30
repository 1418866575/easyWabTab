<script setup lang="ts">
/**
 * URL 编解码与参数解析（纯前端实现）
 */
import { computed, ref, watch } from 'vue'
import {
  buildUrl,
  decodeUrl,
  encodeUrl,
  paramsToText,
  parseUrl,
  textToParams,
  type UrlParam
} from '../../core/url'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const mode = ref<'encode' | 'decode'>('encode')
const scope = ref<'component' | 'full'>('component')
const input = ref('https://example.com/search?q=你好 easy&from=toolbox')
const fullUrl = ref('https://example.com/search?q=hello&utm_source=toolbox&utm_medium=card')
const params = ref<UrlParam[]>([])

useDirtyFlag(() => !!input.value.trim() || !!fullUrl.value.trim())
const { copy } = useToolActions()

const result = computed(() => {
  if (!input.value) return { ok: true, text: '' }
  return mode.value === 'encode' ? { ok: true, text: encodeUrl(input.value, scope.value) } : decodeUrl(input.value)
})

const parsed = computed(() => parseUrl(fullUrl.value))

watch(
  parsed,
  p => {
    if (p.ok) params.value = p.params.map(x => ({ ...x }))
  },
  { immediate: true }
)

const built = computed(() => buildUrl(parsed.value.base || '', params.value.filter(p => p.key)))
const paramText = computed(() => paramsToText(params.value.filter(p => p.key)))
const utmList = computed(() => Object.entries(parsed.value.utm || {}).map(([k, v]) => `${k} = ${v}`))

function addParam() {
  params.value.push({ key: '', value: '' })
}

function removeParam(i: number) {
  params.value.splice(i, 1)
}

function applyText(text: string) {
  params.value = textToParams(text)
}
</script>

<template>
  <div class="tu-t3">
    <section>
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': mode === 'encode' }" @click="mode = 'encode'">编码</button>
          <button type="button" :class="{ 'is-on': mode === 'decode' }" @click="mode = 'decode'">解码</button>
        </div>
        <div v-if="mode === 'encode'" class="tu-seg">
          <button type="button" :class="{ 'is-on': scope === 'component' }" @click="scope = 'component'">
            component
          </button>
          <button type="button" :class="{ 'is-on': scope === 'full' }" @click="scope = 'full'">full</button>
        </div>
        <span class="tu-spacer" />
        <button type="button" class="tu-btn ghost" @click="input = result.text">结果写回</button>
      </div>

      <TuField :label="mode === 'encode' ? '原始文本 / URL' : '已编码的 URL'">
        <textarea
          v-model="input"
          class="tu-textarea"
          rows="3"
          spellcheck="false"
          placeholder="输入待处理内容"
          data-testid="tb-modal-input"
        />
      </TuField>

      <TuOutput
        :title="mode === 'encode' ? '编码结果' : '解码结果'"
        :text="result.text"
        filename="url-result.txt"
        empty="输入内容后显示结果"
      >
        <pre class="tu-code">{{ result.text }}</pre>
      </TuOutput>
    </section>

    <section>
      <TuField label="完整 URL 解析">
        <input v-model="fullUrl" class="tu-input" spellcheck="false" placeholder="https://example.com/a?b=1&utm_source=x" />
      </TuField>

      <p v-if="!parsed.ok" class="tu-alert">{{ parsed.error }}</p>

      <TuOutput title="Query 参数（可编辑并重建 URL）" :text="paramText" filename="params.txt" empty="无参数">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>参数名</th>
                <th>参数值</th>
                <th style="width: 60px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in params" :key="i">
                <td><input v-model="p.key" class="tu-input" placeholder="key" /></td>
                <td><input v-model="p.value" class="tu-input" placeholder="value" /></td>
                <td><button type="button" class="tu-btn ghost" @click="removeParam(i)">删除</button></td>
              </tr>
              <tr v-if="!params.length">
                <td colspan="3" class="tu-out-empty">暂无参数</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="addParam">新增参数</button>
          <button type="button" class="tu-btn ghost" @click="applyText(paramText)">按当前顺序重置</button>
        </div>
      </TuOutput>

      <TuOutput title="重建后的 URL" :text="built" filename="url.txt" empty="—">
        <pre class="tu-code">{{ built }}</pre>
      </TuOutput>

      <TuOutput
        v-if="utmList.length"
        title="UTM 追踪参数"
        :text="utmList.join('\n')"
        filename="utm.txt"
        empty="未识别到 UTM 参数"
      >
        <ul class="tu-list">
          <li v-for="u in utmList" :key="u" class="tu-mono">{{ u }}</li>
        </ul>
      </TuOutput>

      <div class="tu-row">
        <button type="button" class="tu-btn ghost" :disabled="!built" @click="copy(built)">复制 URL</button>
      </div>
    </section>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>编码区分 component（编码 <code>&amp;</code>、<code>=</code> 等）与 full（保留 URL 结构）。</li>
          <li>解析区可直接增删改 Query 参数并实时重建 URL。</li>
          <li>自动识别 <code>utm_*</code> 系列追踪参数。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8; }
.tu-code {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
section { display: flex; flex-direction: column; gap: 12px; }
</style>
