<script setup lang="ts">
// 座位表：行列布局设置 + 按名单/随机排座 + 拖拽互换（移动端降级为点选两块互换）。
// 空位显示斜纹占位与座位号；女生粉块、男生蓝块、特异体质右上角红色「!」。

import { computed, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const seats = computed(() => b.value?.seats ?? { rows: 6, cols: 8, grid: [] })

const rowsInput = ref(seats.value.rows)
const colsInput = ref(seats.value.cols)

watch(
  () => [seats.value.rows, seats.value.cols],
  ([r, c]) => {
    rowsInput.value = r as number
    colsInput.value = c as number
  }
)

const studentMap = computed(() => {
  const m = new Map<string, { name: string; no: string; gender: '男' | '女'; special: boolean }>()
  for (const s of b.value?.students ?? []) {
    m.set(s.id, { name: s.name, no: s.no, gender: s.gender, special: s.special })
  }
  return m
})

function studentOf(id: string | null) {
  return id ? studentMap.value.get(id) ?? null : null
}

// ---------- 拖拽 ----------
const dragIndex = ref<number | null>(null)
const picked = ref<number | null>(null)

function onDragStart(i: number): void {
  dragIndex.value = i
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
}

async function onDrop(i: number): Promise<void> {
  const from = dragIndex.value
  dragIndex.value = null
  if (from === null || from === i) return
  await store.swapSeat(from, i)
}

/** 点选互换（移动端/无拖拽场景）：先点 A 再点 B */
async function onSeatClick(i: number): Promise<void> {
  if (picked.value === null) {
    picked.value = i
    return
  }
  const from = picked.value
  picked.value = null
  if (from === i) return
  await store.swapSeat(from, i)
}

async function onApplyLayout(): Promise<void> {
  await store.setSeatLayout(rowsInput.value, colsInput.value)
}

async function onArrange(mode: 'roster' | 'random'): Promise<void> {
  await store.arrangeSeats(mode)
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const st = seats.value
  const cols = st.cols || 0
  const headers = ['', ...Array.from({ length: cols }, (_, i) => `${i + 1}`)]
  const rows: Array<Array<string | number | null>> = []
  for (let r = 0; r < (st.rows || 0); r++) {
    const cells = (st.grid || []).slice(r * cols, r * cols + cols).map((sid) => studentOf(sid)?.name ?? '')
    rows.push([`第${r + 1}行`, ...cells])
  }
  await exportExcel(excelFileName('座位表', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '座位表', headers, rows }
  ])
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">座位表</h3>
        <p class="tw-subtitle">拖动任意座位方块到另一个座位上即可交换两人的位置；放到空位则移动到该空位。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn tw-btn-primary" @click="onArrange('roster')">按名单排座</button>
        <button type="button" class="tw-btn tw-btn-primary" @click="onArrange('random')">随机排座</button>
        <button type="button" class="tw-btn tw-no-print" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn tw-no-print" @click="exportExcelFile">导出 Excel</button>
      </div>
    </div>

    <section class="tw-card tw-no-print">
      <h4 class="tw-card-title">座位布局设置</h4>
      <div class="tw-toolbar">
        <label class="tw-label">行数<el-input v-model.number="rowsInput" type="number" size="small" min="1" max="12" class="st-num" /></label>
        <label class="tw-label">列数<el-input v-model.number="colsInput" type="number" size="small" min="1" max="12" class="st-num" /></label>
        <button type="button" class="tw-btn tw-btn-sm" @click="onApplyLayout">应用布局</button>
        <span class="tw-label">最多 12 行 × 12 列；变更时已有学生按原顺序重排，多余截断。</span>
      </div>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">座位编排</h4>
      <div v-if="seats.grid.length" class="st-podium-wrap">
        <span class="st-podium-side">左</span>
        <div class="st-podium"><span>讲台</span></div>
        <span class="st-podium-side">右</span>
      </div>
      <div
        v-if="seats.grid.length"
        class="tw-seat-grid"
        :style="{ gridTemplateColumns: `repeat(${seats.cols}, minmax(0, 1fr))` }"
      >
        <div
          v-for="(sid, i) in seats.grid"
          :key="i"
          class="tw-seat"
          :class="[
            studentOf(sid) ? (studentOf(sid)!.gender === '男' ? 'tw-chip-male' : 'tw-chip-female') : 'tw-seat-empty',
            { 'tw-seat-picked': picked === i }
          ]"
          :draggable="!!sid"
          :title="studentOf(sid) ? studentOf(sid)!.name : `空位 ${i + 1}`"
          @dragstart="onDragStart(i)"
          @dragover="onDragOver"
          @drop="onDrop(i)"
          @click="onSeatClick(i)"
        >
          <span class="tw-seat-no">{{ i + 1 }}</span>
          <template v-if="studentOf(sid)">
            <span class="tw-chip-badge" v-if="studentOf(sid)!.special">!</span>
            <span>{{ studentOf(sid)!.name }}</span>
          </template>
          <span v-else class="tw-seat-placeholder">空位</span>
        </div>
      </div>
      <p v-else class="tw-empty">暂无座位数据。</p>
      <p class="tw-note st-tip">提示：电脑端可直接拖动方块；手机端点一下 A 再点一下 B 即可互换（选中块会高亮）。</p>
    </section>
  </div>
</template>

<style scoped>
.st-num {
  width: 72px;
}

.st-tip {
  margin-top: 12px;
}

.tw-seat-placeholder {
  font-size: var(--font-size-xs, 11px);
}

/* 讲台：座位编排区域正上方（教室前端），梯形图形 + 左右方位标识 */
.st-podium-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 18px;
}

.st-podium {
  position: relative;
  width: min(60%, 440px);
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  letter-spacing: 4px;
  background: var(--color-primary, #6da3d8);
  clip-path: polygon(10% 0, 90% 0, 100% 100%, 0 100%);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
}

.st-podium-side {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 12px;
  border-radius: 15px;
  background: var(--color-bg-hover, #eef1f5);
  color: var(--color-text-secondary, #8a93a0);
  font-size: 13px;
  font-weight: 500;
}

@media (max-width: 768px) {
  .st-podium {
    width: 72%;
    height: 36px;
  }
  .st-podium-side {
    min-width: 26px;
    height: 26px;
    padding: 0 9px;
  }
}
</style>
