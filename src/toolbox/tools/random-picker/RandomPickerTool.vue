<script setup lang="ts">
/**
 * 随机抽签 & 决策转盘（转盘 / 抽签 / 随机数 / 骰子 / 抛硬币）
 */
import { computed, ref } from 'vue'
import { coin, dice, pick, randomInt, shuffle, spinWheel } from '../../core/random'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const itemsText = ref('选项 A\n选项 B\n选项 C\n选项 D')
const pickCount = ref(1)
const allowRepeat = ref(false)
const picked = ref<string[]>([])
const rotation = ref(0)
const spinning = ref(false)
const wheelResult = ref('')
const intMin = ref(1)
const intMax = ref(100)
const intCount = ref(5)
const ints = ref<number[]>([])
const diceFaces = ref(6)
const diceResult = ref<number | null>(null)
const coinResult = ref('')
const history = ref<string[]>([])

useDirtyFlag(() => picked.value.length > 0 || history.value.length > 0)
const { copy } = useToolActions()

const items = computed(() =>
  itemsText.value
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)
)

function pushHistory(text: string) {
  history.value.unshift(text)
  history.value = history.value.slice(0, 20)
}

function doPick() {
  picked.value = pick(items.value, Math.max(1, Number(pickCount.value) || 1), allowRepeat.value)
  pushHistory(`抽签：${picked.value.join('、')}`)
}

function doShuffle() {
  itemsText.value = shuffle(items.value).join('\n')
}

function doSpin() {
  if (!items.value.length || spinning.value) return
  spinning.value = true
  wheelResult.value = ''
  const res = spinWheel(items.value)
  const turns = 5
  rotation.value = rotation.value + (360 - (rotation.value % 360)) + turns * 360 + res.angle
  wheelResult.value = res.item
  pushHistory(`转盘：${res.item}`)
  window.setTimeout(() => (spinning.value = false), 2600)
}

function doInts() {
  const n = Math.max(1, Math.min(100, Number(intCount.value) || 1))
  const lo = Number(intMin.value) || 0
  const hi = Number(intMax.value) || 0
  const a = Math.min(lo, hi)
  const b = Math.max(lo, hi)
  ints.value = Array.from({ length: n }, () => randomInt(a, b))
}

function doDice() {
  diceResult.value = dice(Math.max(2, Number(diceFaces.value) || 6))
  pushHistory(`骰子：${diceResult.value}`)
}

function doCoin() {
  coinResult.value = coin()
  pushHistory(`抛硬币：${coinResult.value}`)
}

const wheelStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg)`,
  transition: spinning.value ? 'transform 2.4s cubic-bezier(0.17, 0.67, 0.16, 1)' : 'none'
}))

const segments = computed(() => {
  const n = items.value.length || 1
  const seg = 360 / n
  return items.value.map((name, i) => ({
    name,
    color: `hsl(${Math.round((360 / n) * i)}, 70%, ${55 + (i % 2) * 10}%)`,
    rotate: i * seg,
    seg
  }))
})
</script>

<template>
  <div class="tu-t5">
    <div class="tu-t2">
      <TuField label="候选项（每行一个）">
        <textarea v-model="itemsText" class="tu-textarea" rows="8" spellcheck="false" data-testid="tb-modal-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" :disabled="!items.length" @click="doShuffle">打乱顺序</button>
          <span class="tu-hint">共 {{ items.length }} 项</span>
        </div>
      </TuField>

      <TuField label="决策转盘">
        <div class="tu-wheel-box">
          <div class="tu-wheel" :style="wheelStyle">
            <div
              v-for="(s, i) in segments"
              :key="i"
              class="tu-wheel-seg"
              :style="{ background: s.color, transform: `rotate(${s.rotate}deg) skewY(${90 - s.seg}deg)` }"
            />
          </div>
          <span class="tu-wheel-pointer" aria-hidden="true">▼</span>
        </div>
        <div class="tu-row">
          <button type="button" class="tu-btn" :disabled="!items.length || spinning" @click="doSpin">
            {{ spinning ? '旋转中…' : '开始转盘' }}
          </button>
        </div>
        <p v-if="wheelResult" class="tu-alert ok">转盘结果：{{ wheelResult }}</p>
      </TuField>
    </div>

    <div class="tu-t2">
      <TuField label="随机抽签">
        <div class="tu-row">
          <span class="tu-label">抽取数量</span>
          <input v-model.number="pickCount" type="number" min="1" class="tu-input tu-inline" style="max-width: 90px" />
          <button type="button" class="tu-check" :class="{ 'is-on': allowRepeat }" @click="allowRepeat = !allowRepeat">
            允许重复
          </button>
          <button type="button" class="tu-btn" :disabled="!items.length" @click="doPick">抽签</button>
        </div>
        <div v-if="picked.length" class="tu-swatches">
          <span
            v-for="(p, i) in picked"
            :key="i"
            class="tu-swatch"
            style="background: var(--color-primary-soft); color: var(--color-primary)"
          >{{ p }}</span>
        </div>
      </TuField>

      <TuField label="随机数 / 骰子 / 硬币">
        <div class="tu-row">
          <span class="tu-label">范围</span>
          <input v-model.number="intMin" type="number" class="tu-input tu-inline" style="max-width: 90px" />
          <span>~</span>
          <input v-model.number="intMax" type="number" class="tu-input tu-inline" style="max-width: 90px" />
          <span class="tu-label">个数</span>
          <input v-model.number="intCount" type="number" min="1" max="100" class="tu-input tu-inline" style="max-width: 80px" />
          <button type="button" class="tu-btn ghost" @click="doInts">生成</button>
        </div>
        <p v-if="ints.length" class="tu-mono break">{{ ints.join('  ') }}</p>
        <div class="tu-row">
          <span class="tu-label">骰子面数</span>
          <input v-model.number="diceFaces" type="number" min="2" class="tu-input tu-inline" style="max-width: 80px" />
          <button type="button" class="tu-btn ghost" @click="doDice">掷骰子</button>
          <button type="button" class="tu-btn ghost" @click="doCoin">抛硬币</button>
        </div>
        <div class="tu-stat">
          <span v-if="diceResult !== null">骰子：{{ diceResult }}</span>
          <span v-if="coinResult">硬币：{{ coinResult }}</span>
        </div>
      </TuField>
    </div>

    <TuOutput
      title="历史记录（最近 20 条）"
      :text="history.join('\n')"
      filename="random-history.txt"
      empty="还没有随机结果"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!history.length" @click="copy(history.join('\n'))">复制</button>
        <button type="button" class="tu-btn ghost" :disabled="!history.length" @click="history = []">清空</button>
      </template>
      <ol class="tu-list">
        <li v-for="(h, i) in history" :key="i">{{ h }}</li>
      </ol>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>候选项每行一个，可用于转盘、抽签与顺序打乱。</li>
          <li>抽签默认不重复；勾选「允许重复」后有放回抽取。</li>
          <li>随机数、骰子、硬币结果会记入下方历史，便于回溯。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.break { word-break: break-all; margin: 4px 0 0; }
.tu-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8; }
.tu-wheel-box { position: relative; width: 220px; height: 220px; margin: 0 auto; }
.tu-wheel {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--color-border);
  background: var(--color-bg-card);
}
.tu-wheel-seg {
  position: absolute;
  top: 0;
  left: 50%;
  width: 50%;
  height: 50%;
  transform-origin: 0% 100%;
}
.tu-wheel-pointer {
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 18px;
  color: var(--color-primary);
}
@media (prefers-reduced-motion: reduce) {
  .tu-wheel { transition: none !important; }
}
</style>
