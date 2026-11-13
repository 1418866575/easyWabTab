<script setup lang="ts">
/**
 * 健康 · 饮食面板「人体需要的七大营养」只读小模块。
 * 结构与视觉对齐 WorkbenchHealthReminders（只读卡片 + 网格条目），不改任何 store。
 * 内容忠实于原文：原文未给出「来源」的条目留空，不自行补写。
 */
interface Nutrient {
  id: string
  name: string
  emoji: string
  desc: string
  sources?: string
}

const NUTRIENTS: Nutrient[] = [
  {
    id: 'protein',
    name: '蛋白质',
    emoji: '🥚',
    desc: '细胞的基础原料，修复身体、长肌肉、造抗体。',
    sources: '蛋、奶、鱼、肉、豆制品'
  },
  {
    id: 'fat',
    name: '脂肪（脂类）',
    emoji: '🥑',
    desc: '储备能量、保护内脏、帮助吸收脂溶性维生素（A / D / E / K）；分饱和、不饱和脂肪。',
    sources: '植物油、坚果、肥肉'
  },
  {
    id: 'carbs',
    name: '碳水化合物',
    emoji: '🍚',
    desc: '身体最主要供能来源，给大脑供能。',
    sources: '米饭、面条、红薯、糖、水果'
  },
  {
    id: 'vitamins',
    name: '维生素',
    emoji: '🍊',
    desc: '调节代谢，量少但必不可少；分水溶性（维 C、B 族）、脂溶性（A / D / E / K）。'
  },
  {
    id: 'minerals',
    name: '矿物质（无机盐）',
    emoji: '🦴',
    desc: '钙、铁、锌、钾、钠等；补钙强骨骼、补铁补血。'
  },
  {
    id: 'water',
    name: '水',
    emoji: '💧',
    desc: '生命之源，参与代谢、运输营养；成人约占体重 60%。'
  },
  {
    id: 'fiber',
    name: '膳食纤维',
    emoji: '🥬',
    desc: '不能被人体消化，促肠道蠕动、稳血糖血脂。',
    sources: '蔬菜、粗粮、菌菇、水果'
  }
]
</script>

<template>
  <section class="dt-nutrients" data-testid="dt-nutrients" aria-label="人体需要的七大营养">
    <div class="dn-head">
      <div class="dn-head-main">
        <span class="dn-kicker">营养小知识</span>
        <h3 class="dn-title">人体需要的七大营养</h3>
      </div>
      <span class="dn-count">7 类</span>
    </div>

    <ul class="dn-list">
      <li
        v-for="item in NUTRIENTS"
        :key="item.id"
        class="dn-item"
        :data-testid="`dt-nutrient-${item.id}`"
      >
        <div class="dn-item-head">
          <span class="dn-emoji" aria-hidden="true">{{ item.emoji }}</span>
          <span class="dn-name">{{ item.name }}</span>
        </div>
        <p class="dn-desc">{{ item.desc }}</p>
        <p v-if="item.sources" class="dn-sources"><span class="dn-label">来源</span>{{ item.sources }}</p>
      </li>
    </ul>

    <p class="dn-source">
      整理自「康定汝分享专业知识」《人体需要的七大营养》（2026-10-31）；仅作科普参考，不替代专业营养建议。
    </p>
  </section>
</template>

<style scoped>
/* 只读卡片：与 WorkbenchHealthReminders 同一套外框（面板统计卡从属样式） */
.dt-nutrients {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 12px 14px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-top: 2px solid var(--color-primary);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.dn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.dn-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dn-kicker {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-muted);
}
.dn-title {
  margin: 0;
  font-size: var(--fs-body, 14px);
  font-weight: 600;
  color: var(--color-text);
}
/* 计数胶囊沿用菜谱卡片 .recipe-cat 的语言 */
.dn-count {
  flex: none;
  padding: 2px var(--space-2);
  font-size: var(--fs-caption, 12px);
  font-weight: 600;
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full, 9999px);
  white-space: nowrap;
}

.dn-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.dn-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: 10px 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
}
.dn-item-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.dn-emoji { font-size: var(--fs-lg); line-height: 1; flex: none; }
.dn-name {
  min-width: 0;
  font-size: var(--fs-sm, 13px);
  font-weight: 600;
  color: var(--color-text);
}
.dn-desc {
  margin: 0;
  font-size: var(--fs-caption, 12px);
  line-height: var(--line-height-relaxed, 1.6);
  color: var(--color-text-secondary);
}
.dn-sources {
  margin: 0;
  font-size: var(--fs-caption, 12px);
  line-height: var(--line-height-relaxed, 1.6);
  color: var(--color-text-secondary);
}
.dn-label {
  margin-right: var(--space-1);
  padding: 0 4px;
  font-size: var(--fs-caption, 12px);
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
  border-radius: var(--radius-sm, 4px);
}
.dn-source {
  margin: 0;
  font-size: var(--fs-caption, 12px);
  line-height: var(--line-height-relaxed, 1.6);
  color: var(--color-text-muted);
}

/* ===== 暗色模式覆盖 ===== */
html.dark .dt-nutrients {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}
html.dark .dn-item {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

@media (max-width: 768px) {
  .dn-list { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
@media (max-width: 359px) {
  .dn-list { grid-template-columns: 1fr; }
}
</style>
