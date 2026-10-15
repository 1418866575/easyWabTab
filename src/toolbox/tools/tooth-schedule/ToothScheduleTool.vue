<script setup lang="ts">
/**
 * 儿童换牙时间表
 *
 * 内容来源：用户提供的儿童口腔发育参考图。
 * 采用纯前端 SVG + 表格，便于主题切换自适应。
 *
 * 结构：
 * - 顶部：阶段时间轴（4 个彩色档位，直观回答「什么时间」）
 * - 中部：牙位示意图（上颌/下颌牙弓，每颗牙标注名称+萌出时间，按阶段配色）
 * - 下部：上下颌萌出时间对照表（精确回答「换哪颗、何时换」）
 * - 六龄齿重点提示 + 免责声明
 */

interface Tooth {
  key: string
  name: string
  upper: string
  lower: string
  stage: number
  note?: string
}

/** 8 类恒牙，按从门牙到智齿的顺序 */
const TEETH: Tooth[] = [
  { key: 'm1', name: '第一磨牙', upper: '约 6 岁', lower: '约 6 岁', stage: 0, note: '六龄齿' },
  { key: 'ci', name: '中切牙', upper: '7-8 岁', lower: '6-7 岁', stage: 0 },
  { key: 'li', name: '侧切牙', upper: '8-9 岁', lower: '7-8 岁', stage: 0 },
  { key: 'ca', name: '尖牙', upper: '10-12 岁', lower: '9-12 岁', stage: 1 },
  { key: 'p1', name: '第一前磨牙', upper: '10-11 岁', lower: '10-12 岁', stage: 1 },
  { key: 'p2', name: '第二前磨牙', upper: '10-12 岁', lower: '11-12 岁', stage: 1 },
  { key: 'm2', name: '第二磨牙', upper: '11-14 岁', lower: '11-14 岁', stage: 2 },
  { key: 'm3', name: '第三磨牙', upper: '17 岁以后', lower: '17 岁以后', stage: 3, note: '智齿，可能不萌出' }
]

/** 4 个萌出阶段（配色与牙位图一致） */
const STAGES = [
  { label: '6-8 岁', color: '#7dd3fc', desc: '切牙与第一磨牙' },
  { label: '9-12 岁', color: '#fdba74', desc: '尖牙与前磨牙' },
  { label: '11-14 岁', color: '#c4b5fd', desc: '第二磨牙' },
  { label: '17 岁以后', color: '#e5e7eb', desc: '第三磨牙（智齿）' }
]

// —— 牙弓几何：在椭圆上按角度布点，上颌取上半弧、下颌取下半弧 ——
const CX = 340
const RX = 250
const RY = 92
const Y_MID = 200
/** 每颗牙相对中线（前牙）的角度偏移（度），由前向后越来越密，贴近真实牙弓 */
const OFFSETS = [6, 19, 33, 47, 59, 69, 78, 86]

const rad = (d: number): number => (d * Math.PI) / 180

interface ArchTooth {
  key: string
  name: string
  color: string
  note?: string
  x: number
  y: number
  labeled: boolean
  age: string
}

function buildArch(arch: 'upper' | 'lower'): ArchTooth[] {
  const list: ArchTooth[] = []
  TEETH.forEach((t, i) => {
    const o = OFFSETS[i]
    const color = STAGES[t.stage].color
    for (const side of [-1, 1] as const) {
      // 上颌：270°±o（sin 为负 → y 在上半）；下颌：90°±o（sin 为正 → y 在下半）
      const angle = arch === 'upper' ? 270 + side * o : 90 + side * o
      const a = rad(angle)
      const x = CX + RX * Math.cos(a)
      const y = Y_MID + RY * Math.sin(a)
      list.push({
        key: t.key,
        name: t.name,
        color,
        note: t.note,
        x,
        y,
        labeled: x < CX && ['ci', 'li', 'ca', 'm1'].includes(t.key), // 仅左侧代表性牙齿，后牙区由颜色+表格说明
        age: arch === 'upper' ? t.upper : t.lower
      })
    }
  })
  return list
}

const upperTeeth = buildArch('upper')
const lowerTeeth = buildArch('lower')

function stageColor(stage: number): string {
  return STAGES[stage].color
}
</script>

<template>
  <div class="tu-t1 ts">
    <p class="tu-hint ts-intro">
      儿童恒牙萌出存在个体差异，下表为常见时间范围，仅供家长参考，具体以孩子实际发育情况为准。
    </p>

    <!-- 阶段时间轴：直观回答「什么时间」 -->
    <div class="ts-timeline">
      <div v-for="s in STAGES" :key="s.label" class="ts-band" :style="{ background: s.color }">
        <div class="ts-band-age">{{ s.label }}</div>
        <div class="ts-band-desc">{{ s.desc }}</div>
      </div>
    </div>

    <!-- 牙位示意图：什么位置、换哪颗 -->
    <div class="ts-arch-wrap">
      <div class="ts-arch-title">牙位示意图（左右对称，标注代表性牙齿）</div>
      <svg class="ts-arch" viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg">
        <text x="340" y="22" text-anchor="middle" font-size="13" font-weight="700" fill="var(--color-text)">上颌</text>
        <text x="340" y="368" text-anchor="middle" font-size="13" font-weight="700" fill="var(--color-text)">下颌</text>

        <!-- 牙弓引导线 -->
        <path d="M 90 200 A 250 92 0 0 1 590 200" fill="none" stroke="var(--color-border)" stroke-width="2" />
        <path d="M 90 200 A 250 92 0 0 0 590 200" fill="none" stroke="var(--color-border)" stroke-width="2" />

        <!-- 上颌牙 -->
        <g v-for="t in upperTeeth" :key="`u-${t.key}-${t.x.toFixed(0)}`">
          <rect
            :x="t.x - 14"
            :y="t.y - 11"
            width="28"
            height="22"
            rx="6"
            :fill="t.color"
            stroke="var(--color-border)"
            stroke-width="1"
          />
          <text v-if="t.labeled" :x="t.x" :y="t.y - 16" text-anchor="middle" font-size="10" font-weight="600" fill="var(--color-text)">{{ t.name }}</text>
          <text v-if="t.labeled" :x="t.x" :y="t.y + 24" text-anchor="middle" font-size="9" fill="var(--color-text-secondary)">{{ t.age }}</text>
        </g>

        <!-- 下颌牙 -->
        <g v-for="t in lowerTeeth" :key="`l-${t.key}-${t.x.toFixed(0)}`">
          <rect
            :x="t.x - 14"
            :y="t.y - 11"
            width="28"
            height="22"
            rx="6"
            :fill="t.color"
            stroke="var(--color-border)"
            stroke-width="1"
          />
          <text v-if="t.labeled" :x="t.x" :y="t.y - 16" text-anchor="middle" font-size="10" font-weight="600" fill="var(--color-text)">{{ t.name }}</text>
          <text v-if="t.labeled" :x="t.x" :y="t.y + 24" text-anchor="middle" font-size="9" fill="var(--color-text-secondary)">{{ t.age }}</text>
        </g>
      </svg>

      <!-- 图例 -->
      <div class="ts-legend">
        <span v-for="s in STAGES" :key="s.label" class="ts-legend-item">
          <i class="ts-dot" :style="{ background: s.color }" />{{ s.label }}
        </span>
      </div>
    </div>

    <!-- 上下颌萌出时间对照表：精确回答「换哪颗、何时换」 -->
    <div class="ts-table-wrap">
      <table class="ts-table">
        <thead>
          <tr>
            <th>牙齿</th>
            <th>上颌萌出</th>
            <th>下颌萌出</th>
            <th>阶段</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in TEETH" :key="t.key">
            <td class="ts-td-tooth">
              {{ t.name }}
              <span v-if="t.note" class="ts-tag" :class="{ 'is-six': t.note === '六龄齿' }">{{ t.note }}</span>
            </td>
            <td>{{ t.upper }}</td>
            <td>{{ t.lower }}</td>
            <td>
              <span class="ts-dot" :style="{ background: stageColor(t.stage) }" />
              {{ STAGES[t.stage].label }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 重点认识六龄齿 -->
    <div class="ts-highlight">
      <div class="ts-highlight-title">
        <span class="ts-highlight-icon">!</span>
        重点认识“六龄齿”
      </div>
      <p class="ts-highlight-body">
        约 6 岁萌出的第一恒磨牙，直接长在乳牙后方，<strong>不会替换任何乳牙</strong>。
        窝沟较深，容易藏污纳垢，是龋齿的高发牙齿，要特别注意清洁，建议及时进行窝沟封闭。
      </p>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>本表为儿童恒牙萌出的常见时间范围，存在个体差异，不能替代专业口腔检查。</li>
          <li>“六龄齿”是终身不换的恒牙，很多家长误以为是乳牙，容易被忽视。</li>
          <li>上下颌同名牙的萌出时间通常相差半年到一年，下颌往往略早于上颌。</li>
          <li>若孩子牙齿萌出顺序或时间与表内差异较大，建议咨询儿童口腔科医生。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.ts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ts-intro {
  margin: 0;
}

/* 阶段时间轴 */
.ts-timeline {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.ts-band {
  border-radius: 12px;
  padding: 12px 10px;
  text-align: center;
  color: #1f2937;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.ts-band-age {
  font-size: 17px;
  font-weight: 800;
  line-height: 1.2;
}
.ts-band-desc {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.85;
}

/* 牙位图 */
.ts-arch-wrap {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-card);
  padding: 12px;
}
.ts-arch-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.ts-arch {
  width: 100%;
  height: auto;
  display: block;
}
.ts-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  margin-top: 6px;
}
.ts-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.ts-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  display: inline-block;
  border: 1px solid var(--color-border);
  flex: 0 0 auto;
}

/* 对照表 */
.ts-table-wrap {
  overflow-x: auto;
}
.ts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.ts-table th,
.ts-table td {
  padding: 9px 12px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
.ts-table th {
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  font-weight: 600;
}
.ts-table tbody tr:hover {
  background: var(--color-primary-soft);
}
.ts-td-tooth {
  font-weight: 600;
  color: var(--color-text);
}
.ts-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--color-bg-hover);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.ts-tag.is-six {
  background: #facc15;
  color: #713f12;
}

/* 六龄齿提示 */
.ts-highlight {
  border: 1px solid var(--color-warning, #b88230);
  border-radius: 12px;
  padding: 14px 16px;
  background: rgba(234, 179, 8, 0.08);
}
.ts-highlight-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-warning, #b88230);
  margin-bottom: 8px;
}
.ts-highlight-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-warning, #b88230);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
}
.ts-highlight-body {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--color-text);
}
.ts-highlight-body strong {
  color: var(--color-warning, #b88230);
}

/* 窄屏适配 */
@media (max-width: 640px) {
  .ts-timeline {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
