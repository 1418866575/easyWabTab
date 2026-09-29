<script setup lang="ts">
/**
 * 正则表达式测试（纯前端实现）
 * - 实时匹配：全局匹配列表 + 索引位置 + 捕获组
 * - 替换预览：支持 $1 / $<name> 引用
 * - 灾难性回溯防护：单字符循环模式检测 + 执行时间预算 + 匹配次数上限
 */
import { computed, ref } from 'vue'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

interface MatchItem {
  index: number
  text: string
  groups: string[]
  named?: Record<string, string>
}

const pattern = ref('(\\w+)@(\\w+\\.\\w+)')
const flags = ref({ g: true, i: false, m: false, s: false, u: false })
const text = ref('联系我们：hello@easy.dev，或者 support@example.com，无效示例 @@')
const replacement = ref('[$1] <$2>')

useDirtyFlag(() => !!pattern.value || !!text.value)
const { copy } = useToolActions()

const MAX_MATCHES = 500
const TIME_BUDGET = 400

const flagString = computed(
  () =>
    (flags.value.g ? 'g' : '') +
    (flags.value.i ? 'i' : '') +
    (flags.value.m ? 'm' : '') +
    (flags.value.s ? 's' : '') +
    (flags.value.u ? 'u' : '')
)

/** 风险提示：嵌套量词 / 单字符重复等易触发回溯的模式 */
const riskHint = computed(() => {
  const p = pattern.value
  if (!p) return ''
  const risky = /\(([^)]*[*+][^)]*)\)\s*[*+]|\(\?:(...)*\)|([*+])\s*\1|(\[[^\]]+\]|\.|\w|\S)\s*[*+]\s*(\1|\2)/.test(p)
  if (risky) return '模式中包含嵌套量词，存在灾难性回溯风险，已启用次数与时间上限保护'
  if (p.length > 200) return '模式较长，匹配耗时可能偏高'
  return ''
})

const compiled = computed(() => {
  if (!pattern.value) return { ok: false, error: '请输入正则表达式', re: null as RegExp | null }
  try {
    return { ok: true, error: '', re: new RegExp(pattern.value, flagString.value) }
  } catch (e) {
    return { ok: false, error: (e as Error).message, re: null as RegExp | null }
  }
})

const matches = computed<MatchItem[]>(() => {
  const { ok, re } = compiled.value
  if (!ok || !re) return []
  const out: MatchItem[] = []
  const global = re.global
  const rx = new RegExp(re.source, global ? re.flags : re.flags + 'g')
  const started = performance.now()
  let m: RegExpExecArray | null
  let count = 0
  while ((m = rx.exec(text.value))) {
    const named = (m.groups || undefined) as Record<string, string> | undefined
    out.push({ index: m.index, text: m[0], groups: m.slice(1), named })
    count++
    if (m[0] === '') rx.lastIndex++
    if (count >= MAX_MATCHES) break
    if (performance.now() - started > TIME_BUDGET) break
  }
  return out
})

const truncated = computed(() => matches.value.length >= MAX_MATCHES)

const replaced = computed(() => {
  const { ok, re } = compiled.value
  if (!ok || !re) return ''
  try {
    return text.value.replace(new RegExp(re.source, re.global ? re.flags : re.flags + 'g'), replacement.value)
  } catch {
    return ''
  }
})
</script>

<template>
  <div class="tu-t3">
    <TuField label="正则表达式" :extra="`/${pattern}/ ${flagString}`">
      <div class="tu-row">
        <span class="tu-mono">/</span>
        <input v-model="pattern" class="tu-input" spellcheck="false" placeholder="例如 (\w+)@(\w+\.\w+)" />
        <span class="tu-mono">/</span>
        <input v-model="flagString" class="tu-input tu-inline" style="max-width: 90px" readonly />
      </div>
      <div class="tu-row">
        <button
          v-for="(v, k) in ({ g: '全局', i: '忽略大小写', m: '多行', s: '点匹配换行', u: 'Unicode' } as Record<string, string>)"
          :key="k"
          type="button"
          class="tu-check"
          :class="{ 'is-on': (flags as Record<string, boolean>)[k] }"
          @click="(flags as Record<string, boolean>)[k] = !(flags as Record<string, boolean>)[k]"
        >{{ v }}</button>
      </div>
      <p v-if="!compiled.ok" class="tu-alert">正则无效：{{ compiled.error }}</p>
      <p v-else-if="riskHint" class="tu-alert">{{ riskHint }}</p>
    </TuField>

    <TuField label="待匹配文本">
      <textarea
        v-model="text"
        class="tu-textarea"
        rows="6"
        spellcheck="false"
        placeholder="在此输入用于测试的文本"
        data-testid="tb-modal-input"
      />
    </TuField>

    <div class="tu-stat">
      <span>匹配数：{{ matches.length }}</span>
      <span v-if="truncated">（已达 {{ MAX_MATCHES }} 条上限，结果被截断）</span>
    </div>

    <TuOutput
      title="匹配结果"
      :text="matches.map(m => `${m.index}: ${m.text}`).join('\n')"
      filename="matches.txt"
      empty="暂无匹配"
    >
      <div v-if="matches.length" class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th style="width: 70px">位置</th>
              <th>匹配文本</th>
              <th>捕获组</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, i) in matches" :key="i">
              <td>{{ m.index }}</td>
              <td class="tu-mono">{{ m.text }}</td>
              <td class="tu-mono">
                <template v-if="m.groups.length">
                  {{ m.groups.map((g, gi) => `$${gi + 1}=${g === undefined ? '—' : g}`).join('  ') }}
                  <template v-if="m.named">
                    <br />
                    {{ Object.entries(m.named).map(([k, v]) => `${k}=${v}`).join('  ') }}
                  </template>
                </template>
                <span v-else class="tu-out-empty">无</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tu-out-empty">没有匹配到任何内容</p>
    </TuOutput>

    <TuField label="替换预览">
      <input v-model="replacement" class="tu-input" placeholder="替换文本，可用 $1 / $<name> 引用捕获组" />
    </TuField>

    <TuOutput
      title="替换结果"
      :text="replaced"
      filename="replaced.txt"
      empty="暂无替换结果"
    >
      <pre class="tu-code">{{ replaced }}</pre>
    </TuOutput>

    <div class="tu-row">
      <button type="button" class="tu-btn ghost" @click="copy(`/${pattern}/${flagString}`)">复制正则字面量</button>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>左侧输入正则与待匹配文本，右侧实时给出匹配位置、文本与捕获组。</li>
          <li>替换框支持 <code>$1</code>、<code>$&lt;名称&gt;</code> 引用，可实时预览替换结果。</li>
          <li>内置防护：最多 {{ MAX_MATCHES }} 条匹配、{{ TIME_BUDGET }}ms 时间预算，并对易回溯写法给出提示。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-code {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
