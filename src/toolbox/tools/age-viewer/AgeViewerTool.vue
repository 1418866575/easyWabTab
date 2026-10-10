<script setup lang="ts">
/**
 * 年龄查看器（纯前端，无持久化）
 *
 * - 左侧第一列：出生年份（范围使年龄在 1–120 岁）
 * - 表头：12 生肖（鼠牛虎兔龙蛇马羊猴鸡狗猪）
 * - 中间内容：每个出生年份所属生肖那一列，显示「今年年龄 = 当前年 − 出生年」并高亮；
 *   其余生肖列显示「—」（该年份没有对应属相的人出生，属相与出生年一一对应）
 * - 每年自动更新：当前年用 new Date().getFullYear() 实时取，跨年重新打开即刷新
 *
 * 生肖索引：以 1984（鼠年）为基准，(year - 4) % 12 === 0 为鼠年，
 * 故 sxIndex(year) = ((year - 4) % 12 + 12) % 12（鼠=0 … 猪=11）。
 */
import { computed } from 'vue'

const SX = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const

/** 生肖索引：0=鼠 … 11=猪 */
function sxIndex(year: number): number {
  return ((year - 4) % 12 + 12) % 12
}

const currentYear = new Date().getFullYear()

interface AgeRow {
  year: number
  sx: string
  /** 12 个生肖列：命中列放年龄，其余为 null */
  cells: (number | null)[]
}

const rows = computed<AgeRow[]>(() => {
  const out: AgeRow[] = []
  for (let age = 1; age <= 120; age++) {
    const year = currentYear - age
    const idx = sxIndex(year)
    const cells = SX.map((_, i) => (i === idx ? age : null))
    out.push({ year, sx: SX[idx], cells })
  }
  return out
})
</script>

<template>
  <div class="tu-t1 av">
    <p class="tu-hint">
      基于当前年 <b>{{ currentYear }}</b> 自动计算：左侧为出生年份，表头为 12 生肖；
      每一行仅在该年份<b>所属生肖</b>列显示「今年年龄 = 当前年 − 出生年」并高亮，其余生肖列显示「—」
      （属相与出生年份一一对应，某一年只对应一个生肖）。年龄范围 1–120 岁，跨年打开自动更新。
    </p>

    <div class="tu-table-wrap av-wrap">
      <table class="tu-table">
        <thead>
          <tr>
            <th class="av-year-head">出生年份</th>
            <th v-for="s in SX" :key="s">{{ s }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.year">
            <td class="av-year">{{ r.year }}<span class="av-sx">（{{ r.sx }}）</span></td>
            <td v-for="(c, i) in r.cells" :key="i" :class="{ 'av-hit': c !== null }">
              {{ c === null ? '—' : c }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.av-wrap {
  max-height: 62vh;
}
/* 出生年份列与生肖列同宽、内容居中 */
.tu-table td,
.tu-table th {
  text-align: center;
  white-space: nowrap;
}
.av-year {
  font-weight: 600;
  color: var(--color-text);
  text-align: left !important;
}
.av-sx {
  color: var(--color-text-muted);
  font-weight: 400;
  font-size: 11px;
  margin-left: 2px;
}
.av-year-head {
  text-align: left !important;
}
/* 命中格：所属生肖列的年龄高亮 */
.av-hit {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 700;
}
</style>
