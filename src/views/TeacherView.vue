<script setup lang="ts">
// 教师工作台主视图（路由 /teacher）
// 布局与 StudentView 一致：顶部工作台切换入口（WorkbenchManagePanel 同款，替换原 PageSwitcher 下拉）+ 学期/班级/身份选择器，左菜单 + 右内容条件渲染。
// 首次进入无学期/无班级时走两步引导（建学期 → 建班级），与原型行为一致。
// 「是否班主任」是按班级的身份：切换班级即切换身份与可见模块（导航移除 + 直达拦截 + 自动回落）。

import { computed, onMounted, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { useAppSettingsStore } from '@/stores/settings'
import WorkbenchManagePanel from '@/components/WorkbenchManagePanel.vue'
import { useCloudSync, type SyncStatus } from '@/composables/useCloudSync'
import Icon from '@/components/Icon.vue'
import AppSettingsDialog from '@/components/AppSettingsDialog.vue'
import TeacherDataManage from '@/components/teacher/TeacherDataManage.vue'
import TeacherStudents from '@/components/teacher/TeacherStudents.vue'
import TeacherCommittee from '@/components/teacher/TeacherCommittee.vue'
import TeacherSeats from '@/components/teacher/TeacherSeats.vue'
import TeacherExams from '@/components/teacher/TeacherExams.vue'
import TeacherPapers from '@/components/teacher/TeacherPapers.vue'
import TeacherDuty from '@/components/teacher/TeacherDuty.vue'
import TeacherParents from '@/components/teacher/TeacherParents.vue'
import TeacherRandom from '@/components/teacher/TeacherRandom.vue'
import TeacherTimetable from '@/components/teacher/TeacherTimetable.vue'
import TeacherSpecial from '@/components/teacher/TeacherSpecial.vue'
import TeacherGrowth from '@/components/teacher/TeacherGrowth.vue'
import TeacherLeave from '@/components/teacher/TeacherLeave.vue'
import TeacherHomework from '@/components/teacher/TeacherHomework.vue'
import TeacherTalks from '@/components/teacher/TeacherTalks.vue'
import TeacherGroups from '@/components/teacher/TeacherGroups.vue'
import TeacherHelp from '@/components/teacher/TeacherHelp.vue'
import SubjectSelect from '@/components/teacher/SubjectSelect.vue'
import { STAGE_OPTIONS, TERM_OPTIONS, type TeacherPageKey, type TeacherRole, type TeacherStage } from '@/types/teacher'

const store = useTeacherStore()

const sidebarCollapsed = ref(false)
// 右上角「设置」入口：数据管理 / 使用说明 / 菜单设置 均收进设置弹窗（左侧菜单已移除「工作台」分组）
const showSettings = ref(false)

// ---------- 引导（两步） ----------
const guideYear = ref('')
const guideTerm = ref('上半年')
const guideStage = ref<TeacherStage>('小学')
const guideGrade = ref('')
const guideName = ref('')
const guideSubject = ref(store.cls?.subject || '')
const guideRole = ref<TeacherRole>('head')

watch(
  () => store.needsSemester,
  (v) => {
    if (v) {
      const now = new Date()
      guideYear.value = String(now.getFullYear())
      guideTerm.value = now.getMonth() < 7 ? '上半年' : '下半年'
    }
  },
  { immediate: true }
)

async function createSemesterFromGuide(): Promise<void> {
  const y = guideYear.value.trim()
  const t = guideTerm.value.trim()
  if (!y || !t) return
  await store.addSemester(y, t)
  guideGrade.value = ''
  guideName.value = ''
  guideSubject.value = store.cls?.subject || ''
}

async function createClassFromGuide(): Promise<void> {
  const g = guideGrade.value.trim()
  const n = guideName.value.trim()
  if (!g || !n) return
  await store.addClass(g, n, guideSubject.value.trim(), guideRole.value, guideStage.value)
}

// ---------- 页面渲染 ----------
const COMPONENTS: Record<TeacherPageKey, unknown> = {
  data: TeacherDataManage,
  students: TeacherStudents,
  committee: TeacherCommittee,
  seats: TeacherSeats,
  exams: TeacherExams,
  papers: TeacherPapers,
  duty: TeacherDuty,
  parents: TeacherParents,
  random: TeacherRandom,
  timetable: TeacherTimetable,
  special: TeacherSpecial,
  growth: TeacherGrowth,
  leave: TeacherLeave,
  homework: TeacherHomework,
  talks: TeacherTalks,
  groups: TeacherGroups,
  help: TeacherHelp
}

// 页面标题由各页面组件自己渲染（含副标题），外壳不重复输出，避免出现两个标题
const currentComp = computed(() => COMPONENTS[store.activePage] ?? TeacherStudents)

function selectPage(key: TeacherPageKey): void {
  store.setActivePage(key) // 内部含可见性拦截
  if (window.innerWidth <= 768) sidebarCollapsed.value = true
}

// ---------- 选择器 ----------
// 学期可切换；班级与「本班身份」为只读展示，随所选学期自动联动（切换入口在设置页）。
async function onSemesterChange(val: unknown): Promise<void> {
  const v = String(val ?? '')
  if (v) await store.selectSemester(v)
}

/** 顶部栏只读展示的任教学科（当前班级任教科目） */
const readonlySubject = computed(() => store.cls?.subject || '未设学科')

/** 顶部栏只读展示的班级名（含「默认」标记） */
const readonlyClass = computed(() => {
  const c = store.cls
  if (!c) return '未选择班级'
  const name = `${c.grade}${c.name}`
  return store.isDefaultClass(c.id) ? `${name}（默认）` : name
})

/** 顶部栏只读展示的本班身份 */
const readonlyRole = computed(() => (store.role === 'head' ? '班主任' : '非班主任 · 科任'))

// ---------- 右上角云同步（共享 useCloudSync 单例，与首页/设置弹窗同一状态） ----------
const settingsStore = useAppSettingsStore()
const cloudSync = useCloudSync()
const cloudEnabled = computed((): boolean => settingsStore.cloudSyncEnabled === true)
const syncBusy = computed(
  (): boolean => cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'
)
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'tv-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'tv-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'tv-sync-btn-error': cloudSync.status.value === 'error'
  })
)
const syncLabel = computed((): string => {
  if (!cloudEnabled.value) return '云同步'
  switch (cloudSync.status.value as SyncStatus) {
    case 'pulling': return '拉取中…'
    case 'pushing': return '推送中…'
    case 'conflict': return '处理冲突'
    case 'error': return '同步失败'
    default: return '云同步'
  }
})
const syncTip = computed((): string => {
  if (!cloudEnabled.value) return '云同步未开启，请在「设置 → 云同步」中开启后使用'
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步过；点击立即同步（教师数据走 teacher.json 信封）'
  const d = new Date(t)
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `上次同步：${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}；点击立即同步`
})
async function handleSyncNowClick(): Promise<void> {
  if (!cloudEnabled.value) {
    window.alert('云同步未开启。请到「设置 → 云同步」填写 WebDAV 地址与账号后开启。')
    return
  }
  await cloudSync.syncNow()
}

onMounted(() => {
  void store.loadTeacher()
})
</script>

<template>
  <div class="tv-shell" :class="{ 'is-collapsed': sidebarCollapsed }">
    <!-- 顶部：页面切换 + 学期/班级/身份 -->
    <header class="tv-topbar">
      <div class="tv-topbar-left">
        <!-- 左上角「工作台管理」同款入口：站点图标 + 点击弹出工作台切换面板（替换原 PageSwitcher 下拉，与导航站行为一致） -->
        <WorkbenchManagePanel
          :trigger-icon="settingsStore.teacherPageIcon"
          trigger-builtin="teacher"
          :trigger-label="settingsStore.teacherPageDisplayName"
          force-show
        />
        <div class="tv-selectors">
          <label class="tw-label">
            学期
            <el-select size="small" :model-value="store.data.current.sem" @change="onSemesterChange">
              <el-option
                v-for="s in store.semesters"
                :key="s.id"
                :value="s.id"
                :label="`${s.year} ${s.term}${store.isDefaultSemester(s.id) ? '（默认）' : ''}`"
              />
            </el-select>
          </label>
          <!-- 只读：随所选学期 / 默认组合自动更新，切换班级请到「设置 → 学期与班级」 -->
          <div class="tv-field" data-testid="teacher-readonly-class">
            <span class="tv-field-label">班级</span>
            <span class="tv-field-value">{{ readonlyClass }}</span>
          </div>
          <div class="tv-field" data-testid="teacher-readonly-role">
            <span class="tv-field-label">本班身份</span>
            <span class="tv-field-value">{{ readonlyRole }}</span>
          </div>
          <div class="tv-field" data-testid="teacher-readonly-subject">
            <span class="tv-field-label">学科</span>
            <span class="tv-field-value">{{ readonlySubject }}</span>
          </div>
        </div>
      </div>
      <div class="tv-topbar-actions">
        <!-- 右上角「设置」入口：数据管理（学期与班级 / 班级信息 / 导入表格 / 备份与恢复）/ 使用说明 / 菜单设置 -->
        <button
          type="button"
          class="tw-btn tw-btn-sm tv-settings-btn"
          title="数据管理 / 使用说明 / 菜单设置"
          data-testid="teacher-settings-entry"
          @click="showSettings = true"
        >
          <Icon name="cog" :size="14" />
          <span class="tv-settings-text">设置</span>
        </button>
        <!-- 收起/展开按钮已移到左侧菜单顶部（课程表上方），此处只留云同步 -->
        <!-- 最右上角：云同步（teacher.json 信封；未开启时禁用并引导去设置） -->
        <button
          type="button"
          class="tw-btn tw-btn-sm tv-sync-btn"
          :class="syncStatusClass"
          :title="syncTip"
          data-testid="teacher-sync-now"
          :disabled="syncBusy"
          @click="handleSyncNowClick"
        >
          <Icon name="cloud" :size="14" />
          <span class="tv-sync-text">{{ syncLabel }}</span>
        </button>
      </div>
    </header>

    <!-- 引导：第一步建学期 -->
    <section v-if="store.needsSemester" class="tv-guide">
      <div class="tw-card tv-guide-card">
        <h2 class="tw-card-title">第 1 步 · 创建学期</h2>
        <p class="tw-card-hint">学期是最高层分组，切换学期即切换全部数据视图。先建一个学期再继续。</p>
        <div class="tv-guide-form">
          <label class="tw-label">学年<el-input v-model="guideYear" placeholder="如 2026" /></label>
          <label class="tw-label">
            学期
            <el-select v-model="guideTerm">
              <el-option v-for="t in TERM_OPTIONS" :key="t" :value="t" :label="t" />
            </el-select>
          </label>
          <button type="button" class="tw-btn tw-btn-primary" :disabled="!guideYear.trim() || !guideTerm.trim()" @click="createSemesterFromGuide">
            创建学期
          </button>
          <button type="button" class="tw-btn" @click="store.loadDemoData()">用演示数据快速体验</button>
        </div>
      </div>
    </section>

    <!-- 引导：第二步建班级 -->
    <section v-else-if="store.needsClass" class="tv-guide">
      <div class="tw-card tv-guide-card">
        <h2 class="tw-card-title">第 2 步 · 创建班级</h2>
        <p class="tw-card-hint">班级归属当前学期。同一教师可在多个班级任教，「本班身份」决定你能看到哪些班务功能。</p>
        <div class="tv-guide-form">
          <label class="tw-label">
            学段
            <el-select v-model="guideStage">
              <el-option v-for="s in STAGE_OPTIONS" :key="s" :value="s" :label="s" />
            </el-select>
          </label>
          <label class="tw-label">年级<el-input v-model="guideGrade" placeholder="如 三年级" /></label>
          <label class="tw-label">班级<el-input v-model="guideName" placeholder="如 1班" /></label>
          <label class="tw-label">
            学科
            <SubjectSelect v-model="guideSubject" placeholder="请选择学科" size="small" />
          </label>
          <label class="tw-label">
            本班身份
            <el-select v-model="guideRole">
              <el-option value="head" label="班主任" />
              <el-option value="subject" label="非班主任 · 科任" />
            </el-select>
          </label>
          <button type="button" class="tw-btn tw-btn-primary" :disabled="!guideGrade.trim() || !guideName.trim()" @click="createClassFromGuide">
            创建班级
          </button>
        </div>
      </div>
    </section>

    <!-- 正常主体 -->
    <div v-else class="tv-body">
      <aside class="tv-sidebar" aria-label="教师工作台功能导航">
        <nav class="tv-nav">
          <!-- 收起 / 展开：位于左侧菜单顶部（课程表菜单项上方） -->
          <button
            type="button"
            class="tw-btn tw-btn-sm tv-collapse-btn tv-nav-collapse"
            :aria-expanded="!sidebarCollapsed"
            :title="sidebarCollapsed ? '展开菜单' : '收起菜单'"
            data-testid="teacher-collapse-sidebar"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="14" />
            <span class="tv-collapse-text">{{ sidebarCollapsed ? '展开' : '收起' }}</span>
          </button>
          <!-- 菜单项扁平展示：分组标题「基础功能」「特色功能」已移除，顺序/名称仍走设置里的自定义 -->
          <button
            v-for="p in store.menuItems"
            :key="p.key"
            type="button"
            class="tv-nav-item"
            :class="{ active: store.activePage === p.key }"
            :title="p.label"
            @click="selectPage(p.key)"
          >
            <span class="tv-nav-icon"><Icon :name="p.icon" :size="16" /></span>
            <span class="tv-nav-label">{{ p.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="tv-content">
        <!-- 仅科任身份时补一条提示；标题不在这里输出，避免与页面组件内的标题重复 -->
        <p v-if="!store.isHead" class="tv-content-head tv-role-tip tw-note">
          当前为「非班主任 · 科任」身份，座位表 / 值日生表 / 联系家长 / 隐私信息已隐藏。
        </p>
        <component :is="currentComp" />
      </main>
    </div>

    <!-- 设置弹窗：source=teacher → 左侧 rail 只显示「教师工作台」（通知与同步仅在导航站设置中显示） -->
    <AppSettingsDialog v-if="showSettings" source="teacher" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.tv-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 100vh;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text, #0f172a);
}

/* ---------- 顶栏 ---------- */
.tv-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background-color: var(--color-bg-card, #ffffff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.tv-topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  min-width: 0;
}

.tv-selectors {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 只读字段（班级 / 本班身份）：与下拉同样式高度，但不可编辑，靠底色与虚框区分 */
.tv-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg-hover, #f1f5f9);
  font-size: var(--font-size-sm, 13px);
}

.tv-field-label {
  color: var(--color-text-muted, #94a3b8);
}

.tv-field-value {
  color: var(--color-text, #334155);
  font-weight: 500;
  white-space: nowrap;
}

.tv-topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ---------- 引导 ---------- */
.tv-guide {
  padding: 24px 16px;
}

.tv-guide-card {
  max-width: 640px;
  margin: 0 auto;
}

.tv-guide-form {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.tv-guide-form .tw-label {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

/* ---------- 主体 ---------- */
.tv-body {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.tv-sidebar {
  flex: 0 0 200px;
  width: 200px;
  padding: 12px 10px;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  position: sticky;
  top: 0;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}

.tv-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 收起 / 展开按钮：位于左侧菜单顶部（课程表上方），与菜单项同宽左对齐 */
.tv-nav-collapse {
  justify-content: flex-start;
  flex-shrink: 0;
  margin-bottom: 4px;
}

/* 分组标题（基础功能 / 特色功能）已不再渲染，此规则保留仅为向后兼容 */
.tv-nav-group {
  margin: 10px 0 4px;
  padding: 0 8px;
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-muted, #94a3b8);
  letter-spacing: 0.04em;
}

.tv-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background-color: transparent;
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.tv-nav-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.tv-nav-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: var(--font-weight-medium, 500);
}

.tv-nav-item:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: -2px;
}

.tv-nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  color: inherit;
}

.tv-nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tv-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}

.tv-content-head {
  margin-bottom: 12px;
}

/* 提示条已独立成块（上方不再有外壳标题），无需顶部间距 */
.tv-role-tip {
  margin-top: 0;
}

/* ---------- 收起态 ---------- */
.tv-shell.is-collapsed .tv-sidebar {
  flex-basis: 56px;
  width: 56px;
  padding-left: 6px;
  padding-right: 6px;
}

.tv-shell.is-collapsed .tv-nav-label,
.tv-shell.is-collapsed .tv-nav-group,
.tv-shell.is-collapsed .tv-collapse-text {
  display: none;
}

.tv-shell.is-collapsed .tv-nav-item,
.tv-shell.is-collapsed .tv-nav-collapse {
  justify-content: center;
  padding: 0;
}

/* ---------- 移动端：侧栏变底部横向滚动菜单 ---------- */
@media (max-width: 768px) {
  .tv-body {
    flex-direction: column;
  }

  .tv-sidebar {
    position: static;
    flex: 0 0 auto;
    width: 100%;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .tv-nav {
    flex-direction: row;
    gap: 6px;
    flex-wrap: nowrap;
  }

  .tv-nav-group {
    display: none;
  }

  .tv-nav-item {
    flex: 0 0 auto;
    min-height: 44px;
    padding: 0 12px;
    white-space: nowrap;
  }

  /* 移动端侧栏是横向滚动条，收起会挤成 56px 宽导致错版，故隐藏该按钮 */
  .tv-nav-collapse {
    display: none;
  }

  .tv-content {
    padding: 12px;
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }

  .tv-collapse-text,
  .tv-settings-text {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tv-nav-item {
    transition: none;
  }
}
</style>
