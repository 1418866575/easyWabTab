<script setup lang="ts">
/**
 * 字帖生成器：田字格 / 米字格 / 方格 / 四线格，A4 排版打印
 */
import { computed, ref } from 'vue'
import { hasPinyin, pinyinOf } from '../../core/pinyin'
import { clampCols, clampRows, GRID_KINDS, layoutChars, traceAlpha, type CopybookOpts, type GridKind } from './copybookCore'
import { useToolActions } from '../../composables/useToolActions'

const text = ref('一二三四五\n金木水火土\n天地分上下\n日月照今古')
const grid = ref<GridKind>('tian')
const cols = ref(10)
const rows = ref(8)
const trace = ref<0 | 1 | 2>(1)
const showPinyin = ref(true)

const { copy } = useToolActions()

const chars = computed(() =>
  text.value
    .replace(/\r/g, '')
    .split(/[\n,，。;；、\s]+/)
    .join('')
    .split('')
)

const opts = computed<CopybookOpts>(() => ({
  grid: grid.value,
  cols: clampCols(cols.value),
  rows: clampRows(rows.value),
  trace: trace.value,
  showPinyin: showPinyin.value
}))

const pages = computed(() => layoutChars(chars.value, opts.value, pinyinOf))
const missing = computed(() => {
  const set = new Set<string>()
  for (const ch of chars.value) if (!hasPinyin(ch)) set.add(ch)
  return [...set].slice(0, 12)
})
const missingCount = computed(() => {
  const set = new Set<string>()
  for (const ch of chars.value) if (!hasPinyin(ch)) set.add(ch)
  return set.size
})

const traceOpacity = computed(() => traceAlpha(trace.value))

function print() {
  window.print()
}
</script>

<template>
  <div class="tu-t1 cb-screen">
    <div class="tu-row">
      <div class="tu-seg">
        <button v-for="g in GRID_KINDS" :key="g.id" type="button" :class="{ 'is-on': grid === g.id }" @click="grid = g.id">{{ g.name }}</button>
      </div>
      <label class="tu-check" :class="{ 'is-on': showPinyin }">
        <input v-model="showPinyin" type="checkbox" /> 显示拼音
      </label>
      <div class="tu-seg">
        <button v-for="t in [{ id: 0 as const, name: '仅示例' }, { id: 1 as const, name: '浅描红' }, { id: 2 as const, name: '深描红' }]" :key="t.id" type="button" :class="{ 'is-on': trace === t.id }" @click="trace = t.id">{{ t.name }}</button>
      </div>
    </div>

    <div class="tu-row">
      <label class="tu-label cb-inline">每页列数 {{ opts.cols }}</label>
      <input v-model.number="cols" type="range" class="tu-range cb-range" min="5" max="12" />
      <label class="tu-label cb-inline">每页行数 {{ opts.rows }}</label>
      <input v-model.number="rows" type="range" class="tu-range cb-range" min="3" max="10" />
      <span class="tu-spacer"></span>
      <button type="button" class="tu-btn ghost" @click="copy(chars.join(''))">复制纯文字</button>
      <button type="button" class="tu-btn" @click="print">打印 / 另存 PDF</button>
    </div>

    <textarea v-model="text" class="tu-textarea cb-input" rows="4" placeholder="输入汉字或短句（换行、标点会自动过滤）"></textarea>

    <p v-if="missingCount" class="tu-alert">
      拼音表未收录 {{ missingCount }} 个字：{{ missing.join(' ') }}（这些格子只显示汉字，不显示拼音）
    </p>

    <div v-for="(p, pi) in pages" :key="pi" class="cb-page">
      <div class="cb-grid" :style="{ gridTemplateColumns: `repeat(${opts.cols}, 1fr)` }">
        <div v-for="(cell, ci) in p.cells" :key="ci" class="cb-cell" :class="'cb-' + grid">
          <div v-if="showPinyin && cell" class="cb-py" :class="{ 'cb-py-missing': !cell.pinyin }">{{ cell.pinyin || '·' }}</div>
          <div v-else-if="showPinyin" class="cb-py"></div>
          <div class="cb-guides"><span v-if="grid === 'mi' || grid === 'tian'" class="cb-v"></span><span v-if="grid === 'mi' || grid === 'tian'" class="cb-h"></span><span v-if="grid === 'mi'" class="cb-d1"></span><span v-if="grid === 'mi'" class="cb-d2"></span></div>
          <span v-if="cell" class="cb-ch" :style="{ opacity: traceOpacity }">{{ cell.ch }}</span>
        </div>
      </div>
      <p v-if="pages.length > 1" class="cb-page-no">{{ pi + 1 }} / {{ pages.length }}</p>
    </div>

    <p class="tu-hint">
      共 {{ chars.length }} 个字，排 {{ pages.length }} 页。打印时在弹出的对话框里选择「另存为 PDF」即可得到 PDF；
      纸张方向建议纵向，边距默认。
    </p>
  </div>
</template>

<style scoped>
.cb-inline { margin-bottom: 0; }
.cb-range { width: 120px; }
.cb-input { font-size: var(--fs-md); }
.cb-page {
  padding: 20px;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: #111;
}
.cb-grid { display: grid; gap: 4px; }
.cb-cell {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid #c9ced6;
  display: grid;
  place-items: center;
}
.cb-py {
  position: absolute;
  top: -1px;
  left: -1px;
  right: -1px;
  font-size: 9px;
  line-height: 1.5;
  text-align: center;
  color: #555;
  background: #fff;
  border-bottom: 1px solid #e6e9ee;
}
.cb-py-missing { color: #bbb; }
.cb-guides span { position: absolute; background: #e4b6b6; }
.cb-v { left: 50%; top: 0; bottom: 0; width: 1px; }
.cb-h { top: 50%; left: 0; right: 0; height: 1px; }
.cb-d1 { left: 50%; top: 50%; width: 141%; height: 1px; transform: translate(-50%, -50%) rotate(45deg); opacity: 0.55; }
.cb-d2 { left: 50%; top: 50%; width: 141%; height: 1px; transform: translate(-50%, -50%) rotate(-45deg); opacity: 0.55; }
.cb-ch {
  position: relative;
  font-size: 26px;
  font-family: 'KaiTi', '楷体', serif;
  color: #111;
  pointer-events: none;
}
.cb-page-no { margin: 10px 0 0; text-align: right; font-size: 11px; color: #888; }

@media print {
  .cb-screen :deep(.tu-row),
  .cb-screen :deep(.tu-alert),
  .cb-screen :deep(.tu-hint),
  .cb-screen :deep(textarea) {
    display: none !important;
  }
  .cb-page { border: none; page-break-after: always; }
}
</style>
