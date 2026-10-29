<script setup lang="ts">
// 工作台主页仪表盘（轮播布局：问候条 + 三屏轮播「行动台 / 数据概览 / 工具」，6s 自动轮播、hover 暂停）
// 只消费共享 store 的 state/computed，不新增 store、不直写 IDB。
// 外壳通过 @navigate 接收面板跳转请求（WorkbenchView 已做白名单收窄）。
// 菜单开关（设置 → 工作台设置 → 工作台菜单）关闭的功能：左菜单隐藏 + 主页对应统计/面板/快捷添加一并隐藏。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useToast } from '@/composables/useToast'
import { useHomeStats, PRIORITY_META, statusClass } from '@/composables/useHomeStats'
import { useHomeLayout } from '@/composables/useHomeLayout'
import Icon from '@/components/Icon.vue'
import HomeLayoutCard from '@/components/workbench/HomeLayoutCard.vue'
import WeatherCard from '@/components/workbench/WeatherCard.vue'
import CalendarAnchorCard from '@/components/workbench/CalendarAnchorCard.vue'

const emit = defineEmits<{ navigate: [section: string, tab?: string] }>()

const todosStore = useWorkbenchTodosStore()
const notesStore = useWorkbenchNotesStore()
const toast = useToast()

// ===== 主页统计逻辑（从 composable 消费）=====
const {
  menuOn,
  todoStats,
  todoStatusStats,
  todoCompletionRate,
  noteStats,
  countdownStats,
  exerciseStats,
  dietStats,
  sleepStats,
  weightStats,
  ledgerStats,
  habitStats,
  habitDetails,
  visibleStatCards,
  todayOverview,
  upcomingCountdowns,
  pendingTodos,
  isOverdue,
  isUnlocked,
  passwordCount
} = useHomeStats()

// ===== 主页卡片布局（鼠标拖拽排序，参考网站管理卡片 SiteCard）=====
// 顺序逻辑在 useHomeLayout 单例中；卡片直接可拖拽，无需编辑模式开关。
const layout = useHomeLayout()

// 导航：点击卡片跳转对应面板（卡片同时可拖拽排序，点击与拖拽互不冲突）
function navTo(section: string, tab?: string): void {
  emit('navigate', section, tab)
}

// ===== 问候 + 时间（按 now 时段问候：早上好/下午好/晚上好）=====
const now = ref(new Date())
let nowTimer = 0

const greeting = computed(() => {
  const h = now.value.getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const timeText = computed(() =>
  now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
)

const dateText = computed(() =>
  now.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
)

// 时钟刷新间隔（原先直接内联 30000，提成常量便于统一调整）
const CLOCK_TICK_MS = 30000

// 页面切到后台时暂停定时器（时钟），回到前台再恢复。
// 后台标签页里定时器照常触发，会让 Vue 更新与样式重算白跑一遍，移动端尤其耗电；
// 恢复时先校正一次时间，避免回到前台的首帧还显示切走前的旧时间。
function handleVisibilityChange(): void {
  if (document.hidden) {
    window.clearInterval(nowTimer)
    return
  }
  now.value = new Date()
  nowTimer = window.setInterval(() => {
    now.value = new Date()
  }, CLOCK_TICK_MS)
}

onMounted(() => {
  nowTimer = window.setInterval(() => {
    now.value = new Date()
  }, CLOCK_TICK_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})
onUnmounted(() => {
  window.clearInterval(nowTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// ===== 快捷添加待办（回车 addTodo + toast，校验同 WorkbenchTodo.vue 表单）=====
const quickTodoTitle = ref('')

async function handleQuickAdd(): Promise<void> {
  const title = quickTodoTitle.value.trim()
  if (!title) return
  if (title.length > 100) {
    toast.warning('待办标题不能超过 100 字')
    return
  }
  await todosStore.addTodo({ title, priority: 'medium' })
  toast.success('待办已添加')
  quickTodoTitle.value = ''
}

// ===== 快捷添加便签（回车 addNote + toast）=====
const quickNoteTitle = ref('')

async function handleQuickNote(): Promise<void> {
  const title = quickNoteTitle.value.trim()
  if (!title) return
  if (title.length > 100) {
    toast.warning('便签标题不能超过 100 字')
    return
  }
  await notesStore.addNote({ title, content: '', color: 'blue' })
  toast.success('便签已添加')
  quickNoteTitle.value = ''
}
</script>

<template>
  <div class="wb-home">
    <!-- 问候条（静态，全宽） -->
    <section class="bento-card bento-greeting" data-testid="home-greeting">
      <div class="greeting-info">
        <h2 class="greeting-title">{{ greeting }}，欢迎回来</h2>
        <p class="greeting-sub">把今天要做的事，一件一件完成吧</p>
      </div>
      <div class="greeting-clock">
        <div class="greeting-time">{{ timeText }}</div>
        <div class="greeting-date">{{ dateText }}</div>
      </div>
    </section>

    <!-- 今日概览聚合卡（顶部三合一：待办未完成 / 今日番茄 / 本周打卡；点击跳转对应面板） -->
    <section class="bento-card bento-overview" data-testid="home-overview-strip">
      <button class="ov-cell" data-testid="home-ov-todos" @click="navTo('todos')">
        <span class="ov-icon"><Icon name="todos" :size="18" /></span>
        <span class="ov-value">{{ todayOverview.todos }}</span>
        <span class="ov-label">待办待完成</span>
      </button>
      <span class="ov-sep" aria-hidden="true"></span>
      <button class="ov-cell" data-testid="home-ov-pomodoro" @click="navTo('pomodoro')">
        <span class="ov-icon"><Icon name="pomodoro" :size="18" /></span>
        <span class="ov-value">{{ todayOverview.pomodoro }}</span>
        <span class="ov-label">今日番茄</span>
      </button>
      <span class="ov-sep" aria-hidden="true"></span>
      <button class="ov-cell" data-testid="home-ov-habits" @click="navTo('habits')">
        <span class="ov-icon"><Icon name="habits" :size="18" /></span>
        <span class="ov-value">{{ todayOverview.habits }}</span>
        <span class="ov-label">本周打卡</span>
      </button>
    </section>

    <!-- 概览网格（单网格：行动/数据/工具三类卡统一密度，可整体拖拽排序；关键数字在前，输入/列表在后） -->
    <section
      class="home-overview-grid"
      data-testid="home-overview-grid"
      aria-label="主页概览"
      @dragover="layout.handleContainerDragOver('overview', $event)"
      @drop="layout.handleContainerDrop('overview')"
    >
              <HomeLayoutCard v-if="menuOn.todos" card-id="quick-add-todo" :default-w="1">
                <section class="bento-card bento-quick-add">
                  <div class="quick-add-label"><Icon name="todos" :size="16" />快速添加待办</div>
                  <div class="quick-add-row">
                    <el-input
                      v-model="quickTodoTitle"
                      class="quick-add-input"
                      data-testid="home-quick-add-input"
                      maxlength="100"
                      placeholder="输入待办标题，回车即可添加…"
                      @keyup.enter="handleQuickAdd"
                      size="small"
                    />
                    <el-button type="primary" class="quick-add-btn" data-testid="home-quick-add-btn" @click="handleQuickAdd" size="small">添加</el-button>
                  </div>
                </section>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="menuOn.notes" card-id="quick-add-note" :default-w="1">
                <section class="bento-card bento-quick-add">
                  <div class="quick-add-label"><Icon name="notes" :size="16" />快速添加便签</div>
                  <div class="quick-add-row">
                    <el-input
                      v-model="quickNoteTitle"
                      class="quick-add-input"
                      data-testid="home-quick-note-input"
                      maxlength="100"
                      placeholder="输入便签标题，回车即可添加…"
                      @keyup.enter="handleQuickNote"
                      size="small"
                    />
                    <el-button type="primary" class="quick-add-btn" data-testid="home-quick-note-btn" @click="handleQuickNote" size="small">添加</el-button>
                  </div>
                </section>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="menuOn.countdowns" card-id="upcoming" :default-w="1">
                <!-- 入口由「前往」按钮改为整卡点击：6 列密集网格里按钮会把标题挤成省略号 -->
                <section class="bento-card bento-panel is-clickable" @click="navTo('countdowns')">
                  <div class="panel-header">
                    <h3><span class="panel-icon"><Icon name="countdowns" /></span>即将到期提醒</h3>
                  </div>
                  <ul v-if="upcomingCountdowns.length > 0" class="home-list" data-testid="home-upcoming-list">
                    <li v-for="item in upcomingCountdowns" :key="item.id" class="home-list-item">
                      <span class="home-list-title">{{ item.name }}</span>
                      <span class="home-list-meta" :class="statusClass(item.remaining.status)">{{ item.remaining.label }}</span>
                    </li>
                  </ul>
                  <div v-else class="home-empty" data-testid="home-upcoming-empty">暂无即将到期的提醒</div>
                </section>
              </HomeLayoutCard>

              <HomeLayoutCard card-id="weather" :default-w="1">
                <WeatherCard class="bento-weather" />
              </HomeLayoutCard>

          <!-- 数据概览：关键数字卡（卡按 visibleStatCards / 菜单开关 各自显隐） -->
              <HomeLayoutCard v-if="visibleStatCards.includes('todos')" card-id="todos" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-todos" @click="navTo('todos')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="todos" :size="16" /></span>
                    <span class="stat-label">待办任务</span>
                  </div>
                  <div class="stat-body">
                    <div class="stat-value" data-testid="home-stats-value-todos">{{ todoStats.total }}</div>
                    <div class="ring-wrap" :title="`已完成 ${todoCompletionRate}%`">
                      <svg class="progress-ring" viewBox="0 0 36 36" aria-hidden="true">
                        <circle class="ring-track" cx="18" cy="18" r="15.9155" fill="none" />
                        <circle
                          class="ring-bar"
                          cx="18"
                          cy="18"
                          r="15.9155"
                          fill="none"
                          :stroke-dasharray="`${todoCompletionRate} 100`"
                        />
                      </svg>
                      <span class="ring-text">{{ todoCompletionRate }}%</span>
                    </div>
                  </div>
                  <div class="stat-sub">{{ todoStats.active }} 未完成 · {{ todoStats.overdue }} 已逾期</div>
                </div>
              </HomeLayoutCard>

              <!-- 待办统计区域：今日 / 待办 / 进行中 / 已完成 / 归档（消费 store computed，新增·状态变更·归档后实时刷新） -->
              <HomeLayoutCard v-if="visibleStatCards.includes('todos')" card-id="todo-stats" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-todo-status" @click="navTo('todos')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="todos" :size="16" /></span>
                    <span class="stat-label">待办统计</span>
                  </div>
                  <div class="todo-stat-grid">
                    <div class="todo-stat-cell" data-testid="home-todo-stat-today">
                      <span class="todo-stat-value">{{ todoStatusStats.today }}</span>
                      <span class="todo-stat-label">今日</span>
                    </div>
                    <div class="todo-stat-cell" data-testid="home-todo-stat-pending">
                      <span class="todo-stat-value">{{ todoStatusStats.pending }}</span>
                      <span class="todo-stat-label">待办</span>
                    </div>
                    <div class="todo-stat-cell" data-testid="home-todo-stat-in-progress">
                      <span class="todo-stat-value">{{ todoStatusStats.inProgress }}</span>
                      <span class="todo-stat-label">进行中</span>
                    </div>
                    <div class="todo-stat-cell" data-testid="home-todo-stat-completed">
                      <span class="todo-stat-value">{{ todoStatusStats.completed }}</span>
                      <span class="todo-stat-label">已完成</span>
                    </div>
                    <div class="todo-stat-cell" data-testid="home-todo-stat-archived">
                      <span class="todo-stat-value">{{ todoStatusStats.archived }}</span>
                      <span class="todo-stat-label">归档</span>
                    </div>
                  </div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('notes')" card-id="notes" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-notes" @click="navTo('notes')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="notes" :size="16" /></span>
                    <span class="stat-label">便签</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-notes">{{ noteStats.total }}</div>
                  <div class="stat-sub">{{ noteStats.pinned }} 置顶</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('countdowns')" card-id="countdowns" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-countdowns" @click="navTo('countdowns')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="countdowns" :size="16" /></span>
                    <span class="stat-label">提醒</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-countdowns">{{ countdownStats.total }}</div>
                  <div class="stat-sub">{{ countdownStats.near30 }} 项 30 天内到期</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('passwords')" card-id="passwords" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-passwords" @click="navTo('passwords')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="passwords" :size="16" /></span>
                    <span class="stat-label">密码</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-passwords">
                    <template v-if="isUnlocked">{{ passwordCount }} 条</template>
                    <template v-else><Icon name="lock" :size="14" /> 解锁后可见</template>
                  </div>
                  <div class="stat-sub">{{ isUnlocked ? '已解锁' : '未解锁' }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('exercise')" card-id="exercise" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-exercise" @click="navTo('health', 'exercise')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="exercise" :size="16" /></span>
                    <span class="stat-label">运动</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-exercise">{{ exerciseStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-exercise">{{ exerciseStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('diet')" card-id="diet" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-diet" @click="navTo('health', 'diet')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="diet" :size="16" /></span>
                    <span class="stat-label">饮食</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-diet">{{ dietStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-diet">{{ dietStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('sleep')" card-id="sleep" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-sleep" @click="navTo('health', 'sleep')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="sleep" :size="16" /></span>
                    <span class="stat-label">睡眠</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-sleep">{{ sleepStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-sleep">{{ sleepStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('weight')" card-id="weight" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-weight" @click="navTo('health', 'weight')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="weight" :size="16" /></span>
                    <span class="stat-label">体重</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-weight">{{ weightStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-weight">{{ weightStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('ledger')" card-id="ledger" :default-w="1">
                <div class="bento-card bento-stat" data-testid="home-stats-ledger" @click="navTo('ledger')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="ledger" :size="16" /></span>
                    <span class="stat-label">记账</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-ledger">{{ ledgerStats.value }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-ledger">{{ ledgerStats.sub }}</div>
                </div>
              </HomeLayoutCard>

              <HomeLayoutCard v-if="visibleStatCards.includes('habits')" card-id="habits" :default-w="1">
                <div class="bento-card bento-stat bento-stat-habits" data-testid="home-stats-habits" @click="navTo('habits')">
                  <div class="stat-header">
                    <span class="stat-icon"><Icon name="habits" :size="16" /></span>
                    <span class="stat-label">打卡</span>
                  </div>
                  <div class="stat-value" data-testid="home-stats-value-habits">{{ habitStats.metCount }}/{{ habitStats.total }}</div>
                  <div class="stat-sub" data-testid="home-stats-sub-habits">本周打卡 {{ habitStats.weekCheckins }} 次</div>

                  <!-- 悬停展开：每个习惯的本周进度 -->
                  <div class="habit-detail" data-testid="home-habit-detail">
                    <div
                      v-for="h in habitDetails"
                      :key="h.id"
                      class="habit-detail-row"
                      :data-testid="`home-habit-row-${h.id}`"
                    >
                      <div class="habit-detail-top">
                        <span class="habit-detail-name">{{ h.name }}</span>
                        <span class="habit-detail-count" :class="{ met: h.met }">
                          {{ h.completed }}/{{ h.target }}
                          <Icon v-if="h.met" name="check" :size="12" class="habit-detail-check" />
                        </span>
                      </div>
                      <div class="habit-detail-bar">
                        <div
                          class="habit-detail-fill"
                          :style="{ width: h.percent + '%', background: h.color }"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </HomeLayoutCard>

          <!-- 工具：未完成待办 + 日历锚点 -->
              <!-- 未完成待办 -->
              <HomeLayoutCard v-if="menuOn.todos" card-id="pending-todos" :default-w="1">
                <section class="bento-card bento-panel is-clickable" @click="navTo('todos')">
                  <div class="panel-header">
                    <h3><span class="panel-icon"><Icon name="todos" /></span>未完成待办</h3>
                  </div>
                  <ul v-if="pendingTodos.length > 0" class="home-list" data-testid="home-todo-list">
                    <li v-for="todo in pendingTodos" :key="todo.id" class="home-list-item">
                      <span class="home-list-title">{{ todo.title }}</span>
                      <span class="prio-badge" :class="PRIORITY_META[todo.priority].className">
                        {{ PRIORITY_META[todo.priority].label }}
                      </span>
                      <span v-if="todo.dueDate" class="home-list-meta due" :class="{ overdue: isOverdue(todo) }">
                        {{ todo.dueDate }}
                      </span>
                    </li>
                  </ul>
                  <div v-else class="home-empty" data-testid="home-todo-empty">暂无未完成待办</div>
                </section>
              </HomeLayoutCard>

              <!-- 日历锚点卡（发薪/纪念日倒计时） -->
              <HomeLayoutCard card-id="calendar-anchor" :default-w="1">
                <CalendarAnchorCard class="bento-anchor" />
              </HomeLayoutCard>
    </section>
  </div>
</template>

<style scoped>
/* 面板容器（WorkbenchView 的 .wb-content 已提供滚动与背景，此处不 position:fixed） */
.wb-home {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ===== 概览网格（单网格：所有卡统一密度；桌面 6 列 / 平板 3 列 / 手机 1 列） ===== */
.home-overview-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

/* ===== 卡片基础（统一 .bento-card）=====
 * 取值与 styles/workbench.css 的 .wb-content .stat-card 保持一致（= 教师 .tw-card）：
 * 圆角 12px、极轻阴影、hover 不变边框色只微微浮起。首页卡片是工作台的一部分，
 * 若沿用旧的 8px + 重阴影，进出首页时会明显感到「换了一套卡片」。 */
.bento-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: box-shadow var(--transition-fast, 0.15s ease);
}

.bento-card:hover {
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
}

/* 首页是 6 列密集小卡，教师式 4px 标题竖条在这么小的卡里显得碎（11 张卡就是 11 根竖条），
   故首页不挂竖条；竖条保留给整宽卡片（其余面板）。见 styles/workbench.css 的 .stat-header::before。 */
.home-overview-grid .stat-header::before {
  display: none;
}

/* 统计卡瘦身：padding 覆盖（12px 14px），不改共享 .bento-card 的 16px */
.bento-stat {
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
  /* 可点击卡：hover 抬升 + 阴影微交互（边框色不再变化，与 .stat-card:hover 一致） */
  transition:
    transform var(--transition-fast, 0.15s ease),
    box-shadow var(--transition-fast, 0.15s ease);
}

.bento-stat:hover {
  transform: var(--motion-hover-rise, translateY(-1px));
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}

.bento-stat:active {
  transform: scale(0.98);
}

/* ===== 问候条 ===== */
.bento-greeting {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent), transparent),
    var(--color-bg-card, var(--color-bg-card));
}

.greeting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.greeting-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
}

.greeting-sub {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.greeting-clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.greeting-time {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.greeting-date {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

/* ===== 今日概览聚合卡（顶部三合一）===== */
.bento-overview {
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  padding: 4px 8px;
}

.ov-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
  font-family: inherit;
}

.ov-cell:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.ov-cell:active {
  transform: scale(0.97);
}

.ov-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary, var(--color-primary));
}

.ov-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.ov-label {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
}

.ov-sep {
  width: 1px;
  align-self: stretch;
  margin: 12px 0;
  background: var(--color-border, var(--color-border));
}

/* ===== 快捷添加待办 ===== */
.bento-quick-add {
  gap: 10px;
}

.quick-add-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.quick-add-row {
  display: flex;
  gap: 8px;
}

.quick-add-input {
  flex: 1;
  min-width: 0;
}

.quick-add-btn {
  flex-shrink: 0;
}

/* ===== 统计卡头部 =====
 * .stat-header / .stat-icon / .stat-label 的取值统一在 styles/workbench.css
 * （= 教师 .tw-card-title 的 15px/600 + 主色竖条），首页不再单独降字号：
 * 原先降到 13px 是为了给卡内「前往 →」按钮让位，按钮已删（改整卡点击），
 * 6 列卡实测每张 ~167px 内容宽，15px 标题 + 图标足够放下全部现有标题。 */

.stat-value {
  min-width: 0;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-sub {
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 待办统计区域（今日 / 待办 / 进行中 / 已完成 / 归档）===== */
.todo-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.todo-stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 4px;
  min-width: 0;
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-2, var(--color-bg-2));
}

.todo-stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.todo-stat-label {
  font-size: 11px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
}

/* ===== 习惯卡悬停展开（逐条本周进度浮层）===== */
.bento-stat-habits {
  position: relative;
}

.habit-detail {
  position: absolute;
  top: calc(100% - 4px);
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-primary, var(--color-primary));
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 6px 18px rgba(0, 0, 0, 0.18));
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease), visibility 0s linear 0.15s;
  max-height: 260px;
  overflow-y: auto;
  pointer-events: none;
}

.bento-stat-habits:hover .habit-detail,
.bento-stat-habits:focus-within .habit-detail {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  transition: opacity var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease), visibility 0s;
  pointer-events: auto;
}

.habit-detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.habit-detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.habit-detail-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.habit-detail-count {
  flex-shrink: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, var(--color-text-secondary));
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.habit-detail-count.met {
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}

.habit-detail-check {
  color: var(--color-success, var(--color-success));
}

.habit-detail-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--color-border, var(--color-border));
  overflow: hidden;
}

.habit-detail-fill {
  height: 100%;
  border-radius: 999px;
  transition: width var(--transition-fast, 0.15s ease);
}

/* ===== 待办完成率进度环（微可视化，数值来自 store）===== */
.stat-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ring-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.progress-ring {
  width: 44px;
  height: 44px;
  transform: rotate(-90deg);
}

.ring-track {
  stroke: var(--color-border, var(--color-border));
  stroke-width: 3;
}

.ring-bar {
  stroke: var(--color-primary, var(--color-primary));
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray var(--transition-fast, 0.3s ease);
}

.ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

/* ===== 列表面板 ===== */
.bento-panel {
  gap: 12px;
}

.bento-panel.is-clickable {
  cursor: pointer;
}

/* 悬浮反馈与 .bento-stat 同款（整卡可点，点哪儿都进面板） */
.bento-panel.is-clickable:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-icon {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
}

/* ===== 列表 ===== */
.home-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 列表卡限高 + 内部滚动，避免长列表把整行撑高、破坏单屏一瞥 */
  max-height: 224px;
  overflow-y: auto;
}

.home-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 4px);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.home-list-item:hover {
  border-color: var(--color-primary, var(--color-primary));
}

.home-list-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-list-meta {
  flex-shrink: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ===== 优先级徽章（同 WorkbenchTodo.vue）===== */
.prio-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid transparent;
}

.prio-high {
  color: #b91c1c;
  background: #fee2e2;
  border-color: #fca5a5;
}

.prio-medium {
  color: #b45309;
  background: #fef3c7;
  border-color: #fcd34d;
}

.prio-low {
  color: #475569;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

/* ===== 倒计时剩余状态色 ===== */
.cd-normal {
  color: var(--color-success, var(--color-success));
}

.cd-urgent {
  color: var(--color-warning, var(--color-warning));
}

.cd-critical {
  color: var(--color-error, var(--color-error));
}

/* ===== 截止日期 ===== */
.due {
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.due.overdue {
  color: var(--color-error, #ef4444);
  font-weight: 600;
}

/* ===== 空态 ===== */
.home-empty {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 13px;
  padding: 24px 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

/* ===== 暗色模式覆盖 ===== */
html.dark .bento-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bento-greeting {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 12%, transparent), transparent),
    var(--color-bg-card, #1f2937);
}

html.dark .greeting-title,
html.dark .stat-value,
html.dark .panel-header h3,
html.dark .home-list-title {
  color: var(--color-text, #f9fafb);
}

html.dark .ov-cell:hover {
  background-color: var(--color-bg-hover, #374151);
}

html.dark .ov-value {
  color: var(--color-text, #f9fafb);
}

html.dark .ov-icon {
  color: #60a5fa;
}

html.dark .ov-sep {
  background-color: var(--color-border, #374151);
}

html.dark .greeting-time {
  color: #60a5fa;
}

html.dark .greeting-sub,
html.dark .stat-label,
html.dark .stat-sub,
html.dark .ring-text {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .home-list-item {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .home-empty {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .habit-detail {
  background-color: var(--color-bg-card, #1f2937);
  /* 暗色浮层刻意加深阴影（alpha 0.5）以保证与深色背景的分离度 —— 规范 §1.5 允许的暗色手调例外，勿换浅色 token */
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}

html.dark .habit-detail-name {
  color: var(--color-text, #f9fafb);
}

html.dark .habit-detail-bar {
  background-color: #374151;
}

html.dark .prio-high {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
}

html.dark .prio-medium {
  color: #fbbf24;
  background: rgba(180, 83, 9, 0.35);
  border-color: #92400e;
}

html.dark .prio-low {
  color: #cbd5e1;
  background: rgba(71, 85, 105, 0.35);
  border-color: #475569;
}

html.dark .cd-normal {
  color: #4ade80;
}

html.dark .cd-urgent {
  color: #fbbf24;
}

html.dark .cd-critical {
  color: #f87171;
}

/* ===== 响应式：平板双列 / 手机单列 ===== */
@media (max-width: 1100px) {
  .home-overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .home-overview-grid {
    grid-template-columns: 1fr;
  }

  .bento-greeting {
    flex-direction: column;
    align-items: flex-start;
  }

  .greeting-clock {
    align-items: flex-start;
  }
}

</style>

