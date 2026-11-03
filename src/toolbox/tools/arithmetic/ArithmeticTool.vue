<script setup lang="ts">
/**
 * 算术题生成器：加减乘除口算题，A4 双栏排版打印，附答案区
 */
import { computed, ref } from 'vue'
import {
  genPaper,
  formatAnswer,
  MAX_QUESTIONS,
  OP_META,
  splitColumns,
  type ArithOp,
  type ArithOpts
} from './arithmeticCore'
import { useToolActions } from '../../composables/useToolActions'

const ops = ref<ArithOp[]>(['add', 'sub'])
const max = ref(100)
const count = ref(30)
const cols = ref(2)
const seedText = ref('')
const showAnswers = ref(false)

const { copy, save } = useToolActions()

function toggleOp(id: ArithOp) {
  const has = ops.value.includes(id)
  const next = has ? ops.value.filter((o) => o !== id) : ops.value.concat([id])
  ops.value = next.length ? next : [id]
}

const opts = computed<ArithOpts>(() => ({
  ops: ops.value,
  max: max.value,
  allowNegative: false,
  requireCarry: false
}))

const seed = computed(() => {
  const raw = seedText.value.trim()
  if (raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
})

const questions = computed(() => genPaper(opts.value, count.value, seed.value))
const columns = computed(() => splitColumns(questions.value, cols.value))
const answers = computed(() => questions.value.map(formatAnswer).join('   '))

function regenerate() {
  seedText.value = String(Date.now() % 1000000)
}

const plainText = computed(() => questions.value.map((q) => q.text).join('\n'))

function printPage() {
  window.print()
}
</script>

<template>
  <div class="tu-t1 ar-screen">
    <div class="tu-row">
      <div class="tu-seg">
        <button
          v-for="o in OP_META"
          :key="o.id"
          type="button"
          :class="{ 'is-on': ops.includes(o.id) }"
          @click="toggleOp(o.id)"
        >{{ o.name }}</button>
      </div>
      <label class="tu-label ar-inline">数值上限</label>
      <input v-model.number="max" type="number" class="tu-input ar-num" min="10" max="9999" />
      <label class="tu-label ar-inline">题量</label>
      <input v-model.number="count" type="number" class="tu-input ar-num" min="1" :max="MAX_QUESTIONS" />
    </div>

    <div class="tu-row">
      <label class="tu-label ar-inline">栏数</label>
      <input v-model.number="cols" type="range" class="tu-range ar-range" min="1" max="4" />
      <span class="ar-col">{{ cols }}</span>
      <label class="tu-label ar-inline">种子（复现）</label>
      <input v-model="seedText" type="text" class="tu-input ar-seed" placeholder="留空随机" />
      <button type="button" class="tu-btn ghost" @click="regenerate">换一批</button>
      <span class="tu-spacer"></span>
      <label class="tu-check" :class="{ 'is-on': showAnswers }">
        <input v-model="showAnswers" type="checkbox" /> 显示答案区
      </label>
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn ghost" @click="copy(plainText)">复制题目</button>
      <button type="button" class="tu-btn ghost" @click="save('arithmetic.txt', `${plainText}\n\n答案：${answers}`, 'text/plain')">下载 TXT</button>
      <button type="button" class="tu-btn" @click="showAnswers = true; printPage()">打印 / 另存 PDF</button>
    </div>

    <div class="ar-page">
      <h3 class="ar-title">口算练习（{{ max }} 以内{{ ops.map((o) => OP_META.find((m) => m.id === o)?.name).join('・') }}）</h3>
      <div class="ar-cols" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }">
        <ol v-for="(col, ci) in columns" :key="ci" class="ar-list">
          <li v-for="q in col" :key="q.text" class="ar-item">{{ q.text }}</li>
        </ol>
      </div>
      <div v-if="showAnswers" class="ar-answers">
        <strong>答案：</strong>{{ answers }}
      </div>
    </div>

    <p class="tu-hint">
      减法默认不出负数，除法保证整除且除数不为 0；相同种子生成同一批题目。打印时选择「另存为 PDF」即可。
    </p>
  </div>
</template>

<style scoped>
.ar-inline { margin-bottom: 0; }
.ar-num { width: 90px; }
.ar-range { width: 100px; }
.ar-col { font-size: var(--fs-caption); color: var(--color-text-muted); }
.ar-seed { width: 120px; }
.ar-page {
  padding: 20px;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: #111;
}
.ar-title { margin: 0 0 14px; font-size: var(--fs-md); }
.ar-cols { display: grid; gap: 8px 24px; }
.ar-list { margin: 0; padding-left: 22px; font-size: var(--fs-body); }
.ar-item { line-height: 2; }
.ar-answers { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #bbb; font-size: var(--fs-caption); color: #333; }

@media print {
  .ar-screen :deep(.tu-row),
  .ar-screen :deep(.tu-alert),
  .ar-screen :deep(.tu-hint) {
    display: none !important;
  }
  .ar-page { border: none; }
}
</style>
