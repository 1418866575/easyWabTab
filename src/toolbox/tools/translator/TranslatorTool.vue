<script setup lang="ts">
/**
 * 中英互译：离线小词库查询 + 个人词汇本（熟悉度标记 / 自测）
 */
import { computed, onMounted, ref } from 'vue'
import {
  addVocab,
  DICT_SIZE,
  emptyVocab,
  lookup,
  normalizeVocab,
  removeVocab,
  setLevel,
  suggest,
  type Entry,
  type VocabData
} from './translatorCore'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'

const TOOL_ID = 'translator'
const toast = useToast()

const dir = ref<'zh2en' | 'en2zh'>('en2zh')
const query = ref('')
const hit = ref<Entry | null>(null)
const notFound = ref(false)
const vocab = ref<VocabData>(emptyVocab())
const quizWord = ref('')
const quizAnswer = ref('')
const quizShown = ref(false)
const quizOk = ref(false)

const SUGGEST_LIMIT = 8
const hints = computed(() => suggest(query.value, SUGGEST_LIMIT))

async function persist() {
  await saveToolData(TOOL_ID, vocab.value)
}

function search() {
  notFound.value = false
  hit.value = null
  if (!query.value.trim()) return
  const r = lookup(query.value, dir.value)
  if (r) hit.value = { word: r.word, trans: r.trans }
  else notFound.value = true
}

async function addWord() {
  if (!hit.value) return
  const r = addVocab(vocab.value, hit.value)
  if (!r.ok) {
    toast.warning('该词已在词汇本中')
    return
  }
  vocab.value = r.data
  await persist()
  toast.success('已加入词汇本')
}

async function removeWord(id: string) {
  vocab.value = removeVocab(vocab.value, id)
  await persist()
}

async function levelUp(id: string, delta: number) {
  const cur = vocab.value.items.find((i) => i.id === id)?.level ?? 0
  vocab.value = setLevel(vocab.value, id, cur + delta)
  await persist()
}

function startQuiz() {
  if (!vocab.value.items.length) {
    toast.warning('词汇本为空，先收藏几个词')
    return
  }
  const it = vocab.value.items[Math.floor(Math.random() * vocab.value.items.length)]
  quizWord.value = it.word
  quizAnswer.value = it.trans.join('，')
  quizShown.value = false
  quizOk.value = false
}

function revealQuiz() {
  quizShown.value = true
}

function masteredCount() {
  return vocab.value.items.filter((i) => i.level >= 3).length
}

onMounted(async () => {
  vocab.value = normalizeVocab(await loadToolData(TOOL_ID, emptyVocab()))
})
</script>

<template>
  <div class="tu-t1">
    <p class="tu-alert info">离线小词库（内置 {{ DICT_SIZE }} 个高频词），未收录会如实提示；不请求在线翻译接口。</p>

    <div class="tu-row">
      <div class="tu-seg">
        <button type="button" :class="{ 'is-on': dir === 'en2zh' }" @click="dir = 'en2zh'">英 → 中</button>
        <button type="button" :class="{ 'is-on': dir === 'zh2en' }" @click="dir = 'zh2en'">中 → 英</button>
      </div>
      <input
        v-model="query"
        type="text"
        class="tu-input tr-input"
        :placeholder="dir === 'en2zh' ? '输入英文单词…' : '输入中文词…'"
        @keyup.enter="search"
      />
      <button type="button" class="tu-btn" @click="search">查询</button>
    </div>

    <p v-if="hints.length && dir === 'en2zh'" class="tu-hint">联想：{{ hints.join(' · ') }}</p>

    <div v-if="hit" class="tu-card">
      <div class="tu-card-title">释义</div>
      <div class="tr-word">{{ hit.word }}</div>
      <div class="tr-trans">{{ hit.trans.join('；') }}</div>
      <div class="tu-row tr-nomargin">
        <button type="button" class="tu-btn" @click="addWord">加入词汇本</button>
      </div>
    </div>
    <p v-if="notFound" class="tu-alert">离线小词库未收录「{{ query.trim() }}」。</p>

    <div class="tu-card">
      <div class="tu-card-title">词汇本（{{ vocab.items.length }} 个 · 已掌握 {{ masteredCount() }}）</div>
      <div class="tu-row tr-nomargin">
        <button type="button" class="tu-btn ghost" :disabled="!vocab.items.length" @click="startQuiz">随机自测</button>
      </div>
      <div v-if="quizWord" class="tr-quiz">
        <p class="tr-quiz-word">{{ quizWord }}</p>
        <p v-if="quizShown" class="tr-quiz-ans">{{ quizAnswer }}</p>
        <div class="tu-row tr-nomargin">
          <button v-if="!quizShown" type="button" class="tu-btn" @click="revealQuiz">看答案</button>
          <template v-else>
            <button type="button" class="tu-btn ghost" @click="startQuiz">下一个</button>
          </template>
        </div>
      </div>
      <div v-if="vocab.items.length" class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr><th>单词</th><th>释义</th><th>熟悉度</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="i in vocab.items" :key="i.id">
              <td>{{ i.word }}</td>
              <td>{{ i.trans.join('；') }}</td>
              <td>
                <span class="tr-level">{{ '●'.repeat(i.level) }}{{ '○'.repeat(3 - i.level) }}</span>
                <button type="button" class="tu-btn ghost tr-mini" @click="levelUp(i.id, -1)">−</button>
                <button type="button" class="tu-btn ghost tr-mini" @click="levelUp(i.id, 1)">＋</button>
              </td>
              <td><button type="button" class="tu-btn ghost tr-mini" @click="removeWord(i.id)">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="tu-hint">词汇本存本机 IndexedDB；熟悉度 0 未掌握 → 3 已掌握，可用于自测前过滤。</p>
  </div>
</template>

<style scoped>
.tr-input { width: auto; flex: 1; min-width: 160px; }
.tr-nomargin { margin-bottom: 0; }
.tr-word { font-size: var(--fs-h2); font-weight: 600; color: var(--color-text); margin-bottom: 4px; }
.tr-trans { font-size: var(--fs-sm); color: var(--color-text); margin-bottom: 10px; }
.tr-quiz { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border); }
.tr-quiz-word { margin: 0 0 6px; font-size: var(--fs-title); font-weight: 600; color: var(--color-text); }
.tr-quiz-ans { margin: 0 0 10px; font-size: var(--fs-sm); color: var(--color-primary); }
.tr-level { font-size: var(--fs-caption); color: var(--color-primary); margin-right: 6px; }
.tr-mini { min-height: 22px; padding: 1px 7px; font-size: var(--fs-caption); }
</style>
