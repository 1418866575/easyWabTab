<script setup lang="ts">
/**
 * 字数统计：实时统计字符 / 中文字 / 英文词 / 标点 / 行数 / 阅读时长 + 高频字词
 */
import { computed, ref, watch } from 'vue'
import { countText } from './wordCountCore'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'

const MAX_CHARS = 1_000_000

const text = ref('')
const countSpace = ref(true)
const topN = ref(20)
const truncated = ref(false)

useDirtyFlag(() => text.value.length > 0)
const { copy } = useToolActions()

const src = computed(() => (text.value.length > MAX_CHARS ? text.value.slice(0, MAX_CHARS) : text.value))
watch(src, (v) => {
  truncated.value = v.length !== text.value.length
})

const result = computed(() => countText(src.value, { countSpace: countSpace.value, topN: topN.value }))

const summary = computed(() =>
  [
    `字符数：${result.value.chars}`,
    `去空白：${result.value.charsNoSpace}`,
    `中文字：${result.value.chinese}`,
    `英文词：${result.value.englishWords}`,
    `标点：${result.value.punctuation}`,
    `行数：${result.value.lines}`,
    `预计阅读：${result.value.readMinutes} 分钟`
  ].join('\n')
)
</script>

<template>
  <div class="tu-t1">
    <TuField label="待统计文本" :extra="`${src.length} / ${MAX_CHARS}`">
      <textarea
        v-model="text"
        class="tu-textarea"
        rows="8"
        placeholder="在此粘贴或输入文本…"
        data-testid="tb-wordcount-input"
      ></textarea>
    </TuField>

    <p v-if="truncated" class="tu-alert">文本超过 1,000,000 字符，已截断统计前 100 万字符。</p>

    <div class="tu-row">
      <label class="tu-check" :class="{ 'is-on': countSpace }">
        <input v-model="countSpace" type="checkbox" /> 字符数含空白
      </label>
      <label class="tu-label wc-inline">高频词数量</label>
      <input v-model.number="topN" type="range" class="tu-range wc-range" min="5" max="50" step="5" />
      <span class="wc-num">{{ topN }}</span>
      <span class="wc-spacer"></span>
      <button type="button" class="tu-btn ghost" @click="copy(summary)">复制统计结果</button>
    </div>

    <div class="tu-grid">
      <div class="tu-card">
        <div class="tu-card-title">字符数</div>
        <div class="tu-card-value">{{ result.chars }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">去空白字符</div>
        <div class="tu-card-value">{{ result.charsNoSpace }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">中文字数</div>
        <div class="tu-card-value">{{ result.chinese }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">英文单词</div>
        <div class="tu-card-value">{{ result.englishWords }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">标点符号</div>
        <div class="tu-card-value">{{ result.punctuation }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">行数</div>
        <div class="tu-card-value">{{ result.lines }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">预计阅读</div>
        <div class="tu-card-value">{{ result.readMinutes }} 分钟</div>
      </div>
    </div>

    <p class="tu-hint">阅读时长按中文 300 字/分钟、英文 200 词/分钟估算，向上取整。</p>

    <div v-if="result.topWords.length" class="wc-top">
      <h3 class="wc-top-title">高频字词 Top {{ result.topWords.length }}</h3>
      <div class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th class="wc-idx">#</th>
              <th>字词</th>
              <th class="wc-cnt">次数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(w, i) in result.topWords" :key="w.word">
              <td class="wc-idx">{{ i + 1 }}</td>
              <td>{{ w.word }}</td>
              <td class="wc-cnt">{{ w.count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="tu-hint">中文按相邻二字滑窗统计，英文已剔除常见停用词；均为本地计算。</p>
    </div>
  </div>
</template>

<style scoped>
.wc-inline { margin-bottom: 0; }
.wc-range { width: 140px; }
.wc-num { font-size: 12px; color: var(--color-text-muted); font-family: var(--font-family-mono); }
.wc-spacer { flex: 1; }
.wc-top-title { margin: 4px 0 8px; font-size: 13px; font-weight: 600; color: var(--color-text); }
.wc-idx { width: 44px; color: var(--color-text-muted); }
.wc-cnt { width: 72px; font-family: var(--font-family-mono); }
</style>
