<script setup lang="ts">
/**
 * 年龄查看器（纯前端，无持久化）
 *
 * 新版布局：
 * - 顶部醒目显示「最新年份」= new Date().getFullYear()，跨年打开自动更新。
 * - 下方 12 张卡片，每张对应一个生肖，列出该生肖今年可能的年龄。
 *
 * 年龄推算：
 * 年龄 = 当前年 − 出生年，且出生年所属生肖 = 该生肖。
 * 距今年最近的该生肖年份偏移 k0 = ((sxIndex(今年) − z) % 12 + 12) % 12（0–11），
 * 则该生肖今年的年龄为 k0, k0+12, k0+24, …（落在 1–120 岁区间）。
 * 若 k0 = 0（今年就是该生肖年，对应 0 岁婴儿），则从 12 岁起算，跳过 0 岁。
 *
 * 例：2026 为羊年，鼠年 k0=6 → 年龄 6, 18, 30, …, 114。
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

interface ZodiacAges {
  name: string
  /** 该生肖今年可能的年龄（1–120，每 12 岁一档） */
  ages: number[]
}

const zodiacAges = computed<ZodiacAges[]>(() => {
  const curIdx = sxIndex(currentYear)
  return SX.map((name, z) => {
    const k0 = ((curIdx - z) % 12 + 12) % 12 // 距今年最近的该生肖年份偏移
    const ages: number[] = []
    for (let a = k0 === 0 ? 12 : k0; a <= 120; a += 12) ages.push(a)
    return { name, ages }
  })
})
</script>

<template>
  <div class="tu-t1 av">
    <div class="av-year-banner">
      <span class="av-year-label">最新年份</span>
      <span class="av-year-num">{{ currentYear }}</span>
      <span class="av-year-unit">年</span>
    </div>

    <p class="tu-hint">
      按当前年份自动推算：每个生肖下列出今年可能的年龄（1–120 岁，每 12 岁一档）。
      例如 <b>{{ currentYear }} 年</b>属{{ SX[sxIndex(currentYear)] }}，属鼠者今年为 6, 18, 30 … 114 岁。跨年打开自动更新。
    </p>

    <div class="av-grid">
      <div v-for="z in zodiacAges" :key="z.name" class="av-card">
        <div class="av-card-head">
          <span class="av-sx-icon">{{ z.name }}</span>
          <span class="av-sx-name">属{{ z.name }}</span>
        </div>
        <div class="av-ages">
          <span v-for="a in z.ages" :key="a" class="av-age">{{ a }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 顶部最新年份横幅 */
.av-year-banner {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  padding: 14px 16px;
  background: var(--color-primary-soft);
  border-radius: 12px;
  margin-bottom: 10px;
}
.av-year-label {
  color: var(--color-primary);
  font-weight: 600;
}
.av-year-num {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  color: var(--color-primary);
}
.av-year-unit {
  color: var(--color-text-muted);
  font-size: 14px;
}

/* 12 生肖卡片网格 */
.av-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.av-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--color-surface);
}
.av-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px dashed var(--color-border);
}
.av-sx-icon {
  font-size: 18px;
  font-weight: 800;
  color: var(--color-text);
}
.av-sx-name {
  font-size: 12px;
  color: var(--color-text-muted);
}
.av-ages {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.av-age {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  white-space: nowrap;
}

/* 窄屏：降为 2 列，避免卡片被压扁 */
@media (max-width: 640px) {
  .av-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .av-year-num {
    font-size: 28px;
  }
}
</style>
