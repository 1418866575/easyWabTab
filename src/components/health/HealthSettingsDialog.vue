<script setup lang="ts">
/**
 * 健康管理独立设置弹窗（/health 侧栏「设置」按钮入口）。
 * - 与个人工作台 / 智能工作台设置弹窗同构：BaseDialog 外壳 + 左 rail 右内容两栏
 * - 常规：健康管理名称 / 入口图标 / 是否显示入口
 * - 菜单设置：左侧指标菜单的拖拽排序 + 改名 + 上移/下移 + 显隐 + 恢复默认（参考智能工作台菜单设置）
 * - 数据：界面偏好存 settings（随 workbench.json 同步），健康业务数据独立在 health.json
 */
import { computed, onMounted, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import IconPickerDialog from '@/components/IconPickerDialog.vue'
import Icon from '@/components/Icon.vue'
import { useToast } from '@/composables/useToast'
import { showConfirm } from '@/utils/dialog'
import { useAppSettingsStore } from '@/stores/settings'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import type { HeightConfig } from '@/types'
import {
  HEALTH_MENU_KEYS,
  HEALTH_MENU_DEFAULT_LABELS,
  HEALTH_MENU_ICONS,
  moveHealthMenuItem,
  type HealthMenuKey
} from '@/composables/healthMenuCore'

const emit = defineEmits<{ close: [] }>()
const settings = useAppSettingsStore()
const toast = useToast()

type TabKey = 'general' | 'menu' | 'height'
const tab = ref<TabKey>('general')
const SECTIONS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'general', label: '常规', icon: 'cog' },
  { key: 'menu', label: '菜单设置', icon: 'grid' },
  { key: 'height', label: '身高设置', icon: 'account-multiple' }
]
const currentSection = computed(() => SECTIONS.find((s) => s.key === tab.value) ?? SECTIONS[0])

// ==================== 常规 ====================
const healthName = computed<string>({
  get: () => settings.healthPageName,
  set: (v: string) => settings.setHealthPageName(v)
})
const healthVisible = computed<boolean>(() => settings.healthPageVisible !== false)
function setHealthVisible(v: boolean): void {
  settings.setHealthPageVisible(v)
}
const iconPickerOpen = ref(false)
function onPickIcon(src: string): void {
  settings.setHealthPageIcon(src)
  iconPickerOpen.value = false
}
function clearHealthIcon(): void {
  settings.setHealthPageIcon('')
}

// ==================== 菜单设置 ====================
const menuItemsAll = computed(() => {
  const order = settings.healthMenuOrder
  const labels = settings.healthMenuLabels
  const vis = settings.healthMenuVisibility
  const effectiveOrder = order.length ? order : [...HEALTH_MENU_KEYS]
  return effectiveOrder.map((k) => ({
    key: k as HealthMenuKey,
    label: labels[k] ?? HEALTH_MENU_DEFAULT_LABELS[k as HealthMenuKey],
    icon: HEALTH_MENU_ICONS[k as HealthMenuKey],
    hidden: vis[k] === false
  }))
})

const menuEditing = ref<Record<string, string>>({})
const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function menuValue(key: string, label: string): string {
  return menuEditing.value[key] ?? label
}
function onMenuInput(key: string, v: string): void {
  menuEditing.value = { ...menuEditing.value, [key]: v }
}
function commitMenuName(key: string): void {
  const v = menuEditing.value[key]
  if (v === undefined) return
  const labels = { ...settings.healthMenuLabels }
  const val = v.trim()
  if (val && val !== HEALTH_MENU_DEFAULT_LABELS[key as HealthMenuKey]) labels[key] = val.slice(0, 12)
  else delete labels[key]
  settings.setHealthMenu({
    order: settings.healthMenuOrder,
    labels,
    visibility: settings.healthMenuVisibility
  })
  const next = { ...menuEditing.value }
  delete next[key]
  menuEditing.value = next
}
function revertMenuName(key: string): void {
  const next = { ...menuEditing.value }
  delete next[key]
  menuEditing.value = next
}

function moveMenu(key: string, dir: 'up' | 'down'): void {
  const r = moveHealthMenuItem(settings.healthMenuOrder, key, dir)
  if (r.ok) {
    settings.setHealthMenu({
      order: r.order,
      labels: settings.healthMenuLabels,
      visibility: settings.healthMenuVisibility
    })
  }
}
function reorderMenu(from: number, to: number): void {
  const order = [...settings.healthMenuOrder]
  if (from < 0 || from >= order.length || to < 0 || to >= order.length) return
  const [m] = order.splice(from, 1)
  order.splice(to, 0, m)
  settings.setHealthMenu({
    order,
    labels: settings.healthMenuLabels,
    visibility: settings.healthMenuVisibility
  })
}
function onDragStart(index: number, e: DragEvent): void {
  dragFrom.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}
function onDragEnter(index: number): void {
  if (dragFrom.value !== null) dragOver.value = index
}
function onDrop(index: number): void {
  const from = dragFrom.value
  if (from !== null && from !== index) reorderMenu(from, index)
  dragFrom.value = null
  dragOver.value = null
}
function onDragEnd(): void {
  dragFrom.value = null
  dragOver.value = null
}

function onToggleHidden(key: string): void {
  const currentlyHidden = settings.healthMenuVisibility[key] === false
  if (!currentlyHidden) {
    // 隐藏前守卫：至少保留一个可见项
    const visibleCount = menuItemsAll.value.filter((i) => i.hidden === false).length
    if (visibleCount <= 1) {
      toast.warning('至少要保留一个可见的菜单项')
      return
    }
  }
  const vis = { ...settings.healthMenuVisibility }
  if (currentlyHidden) delete vis[key]
  else vis[key] = false
  settings.setHealthMenu({
    order: settings.healthMenuOrder,
    labels: settings.healthMenuLabels,
    visibility: vis
  })
}

async function onResetMenu(): Promise<void> {
  if (!(await showConfirm('确定恢复左侧菜单的默认名称、顺序与显示状态吗？'))) return
  settings.resetHealthMenu()
  menuEditing.value = {}
  toast.success('已恢复默认菜单')
}


// ==================== 身高设置（人员 + 分组） ====================
const healthStore = useWorkbenchHealthStore()
const heightConfig = computed<HeightConfig>(
  () => healthStore.heightConfig ?? { persons: [], categories: [] }
)
const hPersons = computed(() => heightConfig.value.persons)
const hCategories = computed(() => heightConfig.value.categories)
const renameDraft = ref<Record<string, string>>({})
const newCategoryName = ref('')
const newPersonName = ref('')
const newPersonCategory = ref('')

function newId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
function writeHeightConfig(persons: HeightConfig['persons'], categories: HeightConfig['categories']): void {
  void healthStore.setHeightConfig({ persons, categories })
}
function draftOf(id: string, fallback: string): string {
  return renameDraft.value[id] ?? fallback
}
function setDraft(id: string, v: string): void {
  renameDraft.value = { ...renameDraft.value, [id]: v }
}
function clearDraft(id: string): void {
  const next = { ...renameDraft.value }
  delete next[id]
  renameDraft.value = next
}
function recordCountOf(personId: string): number {
  return (healthStore.records.height ?? []).filter(r => r.personId === personId).length
}

function addCategory(): void {
  const name = newCategoryName.value.trim().slice(0, 12)
  if (!name) return
  writeHeightConfig(hPersons.value, [
    ...hCategories.value,
    { id: newId('hc_'), name, createdAt: new Date().toISOString() }
  ])
  newCategoryName.value = ''
  toast.success('已添加分组')
}
function commitCategoryName(id: string): void {
  const raw = renameDraft.value[id]
  if (raw === undefined) return
  const name = raw.trim().slice(0, 12)
  if (name) writeHeightConfig(hPersons.value, hCategories.value.map(c => (c.id === id ? { ...c, name } : c)))
  clearDraft(id)
}
async function removeCategory(id: string): Promise<void> {
  const affected = hPersons.value.filter(p => p.categoryId === id).length
  if (!(await showConfirm(`删除该分组？${affected} 位人员将变为「未分类」。`))) return
  writeHeightConfig(
    hPersons.value.map(p => (p.categoryId === id ? { ...p, categoryId: undefined } : p)),
    hCategories.value.filter(c => c.id !== id)
  )
}
function addPerson(): void {
  const name = newPersonName.value.trim().slice(0, 12)
  if (!name) return
  writeHeightConfig(
    [
      ...hPersons.value,
      {
        id: newId('hp_'),
        name,
        ...(newPersonCategory.value ? { categoryId: newPersonCategory.value } : {}),
        createdAt: new Date().toISOString()
      }
    ],
    hCategories.value
  )
  newPersonName.value = ''
  newPersonCategory.value = ''
  toast.success('已添加人员')
}
function commitPersonName(id: string): void {
  const raw = renameDraft.value[id]
  if (raw === undefined) return
  const name = raw.trim().slice(0, 12)
  if (name) writeHeightConfig(hPersons.value.map(p => (p.id === id ? { ...p, name } : p)), hCategories.value)
  clearDraft(id)
}
function setPersonCategory(id: string, val: string): void {
  writeHeightConfig(
    hPersons.value.map(p => (p.id === id ? { ...p, ...(val ? { categoryId: val } : { categoryId: undefined }) } : p)),
    hCategories.value
  )
}
async function removePerson(id: string): Promise<void> {
  const n = recordCountOf(id)
  if (!(await showConfirm(`删除该人员？其 ${n} 条身高记录将一并删除。`))) return
  for (const r of (healthStore.records.height ?? []).filter(x => x.personId === id)) {
    await healthStore.deleteRecord('height', r.id)
  }
  writeHeightConfig(hPersons.value.filter(p => p.id !== id), hCategories.value)
}

onMounted(async () => {
  // HealthView 已加载；此处只做防御性幂等补载，避免设置弹窗先于视图打开时读到空配置
  const r = healthStore.records
  if (r.exercise.length + r.diet.length + r.sleep.length + r.weight.length + r.height.length === 0) {
    await healthStore.loadHealth()
  }
})
</script>

<template>
  <BaseDialog
    class="hs-dialog"
    title="健康管理设置"
    width="min(720px, 94vw)"
    max-height="86vh"
    body-layout="flex-column"
    :close-on-overlay="false"
    @close="emit('close')"
  >
    <div class="hs-layout">
      <aside class="hs-rail" aria-label="设置项导航">
        <div class="hs-rail-group-label">设置项</div>
        <nav class="hs-rail-nav">
          <button
            v-for="s in SECTIONS"
            :key="s.key"
            type="button"
            class="hs-rail-item"
            :class="{ active: tab === s.key }"
            :aria-current="tab === s.key ? 'page' : undefined"
            :data-testid="`hs-tab-${s.key}`"
            @click="tab = s.key"
          >
            <Icon :name="s.icon" :size="16" />
            <span class="hs-rail-label">{{ s.label }}</span>
          </button>
        </nav>
      </aside>

      <section class="hs-content">
        <header class="hs-content-head">
          <div class="hs-crumb">
            <span class="hs-crumb-item">{{ currentSection.label }}</span>
          </div>
          <span class="hs-saved-pill"><span class="hs-saved-dot"></span>已自动保存</span>
        </header>

        <div class="hs-scroll">
          <!-- ============ 常规 ============ -->
          <section v-show="tab === 'general'" class="hs-pane">
            <div class="hs-head">
              <h3 class="hs-title">健康管理</h3>
            </div>
            <p class="hs-hint">
              设置健康管理入口的名称、图标与显示开关。这里的名称会同步显示在导航站入口卡、工作台切换面板顶部，与左侧菜单无关。
            </p>

            <div class="hs-field">
              <label class="hs-field-label" for="hs-health-name">名称</label>
              <input
                id="hs-health-name"
                type="text"
                class="hs-text-input"
                :value="healthName"
                placeholder="健康管理"
                maxlength="20"
                data-testid="hs-health-name"
                @input="healthName = ($event.target as HTMLInputElement).value"
              />
            </div>

            <div class="hs-field">
              <span class="hs-field-label">入口图标</span>
              <div class="hs-icon-row">
                <button
                  type="button"
                  class="hs-icon-btn"
                  :class="{ 'is-set': !!settings.healthPageIcon }"
                  :title="settings.healthPageIcon ? '已设置图标，点击更换' : '选择图标'"
                  data-testid="hs-health-icon"
                  @click="iconPickerOpen = true"
                >
                  <img v-if="settings.healthPageIcon" :src="settings.healthPageIcon" alt="" class="hs-icon-img" />
                  <Icon v-else name="image" />
                </button>
                <button
                  v-if="settings.healthPageIcon"
                  type="button"
                  class="hs-icon-clear"
                  data-testid="hs-health-icon-clear"
                  @click="clearHealthIcon"
                >恢复默认</button>
                <span class="hs-field-tip">建议上传方形 PNG/SVG，留空则使用内置图标。</span>
              </div>
            </div>

            <div class="hs-field hs-field-switch">
              <span class="hs-field-label">显示入口</span>
              <el-switch
                :model-value="healthVisible"
                data-testid="hs-health-visible"
                @update:model-value="setHealthVisible"
              />
              <span class="hs-field-tip">关闭后导航站入口与切换面板隐藏本工作台，但不会删除已保存的运动、饮食、睡眠、体重数据。</span>
            </div>
          </section>

          <!-- ============ 菜单设置 ============ -->
          <section v-show="tab === 'menu'" class="hs-pane">
            <div class="hs-head">
              <h3 class="hs-title">菜单设置</h3>
              <el-button size="small" data-testid="hs-menu-reset" @click="onResetMenu">恢复默认</el-button>
            </div>
            <p class="hs-hint">
              拖动左侧手柄调整顺序，直接改名，右侧开关控制显示或隐藏；改动即时生效并随云同步保存。
            </p>

            <ul class="hs-list">
              <li
                v-for="(item, index) in menuItemsAll"
                :key="item.key"
                class="hs-row"
                :class="{ 'is-hidden': item.hidden, 'is-dragover': dragOver === index }"
                :data-testid="`hs-menu-row-${item.key}`"
                draggable="true"
                @dragstart="onDragStart(index, $event)"
                @dragenter.prevent="onDragEnter(index)"
                @dragover.prevent
                @drop.prevent="onDrop(index)"
                @dragend="onDragEnd"
              >
                <span class="hs-drag" aria-hidden="true">⠿</span>
                <span class="hs-icon"><Icon :name="item.icon" :size="16" /></span>
                <el-input
                  class="hs-name"
                  size="small"
                  :maxlength="12"
                  :model-value="menuValue(item.key, item.label)"
                  :aria-label="`${item.label}名称`"
                  :data-testid="`hs-menu-name-${item.key}`"
                  @update:model-value="onMenuInput(item.key, $event)"
                  @blur="commitMenuName(item.key)"
                  @keydown.enter="commitMenuName(item.key)"
                  @keydown.esc.stop="revertMenuName(item.key)"
                />
                <div class="hs-actions">
                  <el-button
                    size="small"
                    :data-testid="`hs-menu-up-${item.key}`"
                    :disabled="index === 0"
                    @click="moveMenu(item.key, 'up')"
                  >上移</el-button>
                  <el-button
                    size="small"
                    :data-testid="`hs-menu-down-${item.key}`"
                    :disabled="index === menuItemsAll.length - 1"
                    @click="moveMenu(item.key, 'down')"
                  >下移</el-button>
                  <el-switch
                    size="small"
                    :model-value="!item.hidden"
                    :aria-label="`显示${item.label}`"
                    :data-testid="`hs-menu-toggle-${item.key}`"
                    @update:model-value="onToggleHidden(item.key)"
                  />
                </div>
              </li>
            </ul>
          </section>

          <!-- 身高设置：人员（一人一个标签页）与分组 -->
          <section v-show="tab === 'height'" class="hs-pane" data-testid="hs-height-pane">
            <div class="hs-head">
              <h3 class="hs-title">身高设置</h3>
            </div>
            <p class="hs-hint">创建人员与分组；身高面板按分组筛选人员，每人一个标签页。删除人员会一并删除其身高记录。</p>

            <div class="hs-field hs-field-block">
              <span class="hs-field-label">人员分组</span>
              <div class="hs-new-row">
                <el-input v-model="newCategoryName" size="small" class="hs-name" maxlength="12" placeholder="新分组名称，如：家人" data-testid="hs-new-category" @keydown.enter="addCategory" />
                <el-button size="small" class="btn-add" :disabled="!newCategoryName.trim()" data-testid="hs-add-category" @click="addCategory">＋ 添加分组</el-button>
              </div>
              <ul class="hs-list">
                <li v-for="c in hCategories" :key="c.id" class="hs-row" :data-testid="`hs-category-${c.id}`">
                  <span class="hs-icon"><Icon name="tag" :size="16" /></span>
                  <el-input
                    class="hs-name"
                    size="small"
                    maxlength="12"
                    :model-value="draftOf(c.id, c.name)"
                    :data-testid="`hs-category-name-${c.id}`"
                    @update:model-value="setDraft(c.id, $event)"
                    @blur="commitCategoryName(c.id)"
                    @keydown.enter="commitCategoryName(c.id)"
                  />
                  <div class="hs-actions">
                    <span class="hs-record-count">{{ hPersons.filter(p => p.categoryId === c.id).length }} 人</span>
                    <el-button size="small" class="btn-delete" :data-testid="`hs-category-delete-${c.id}`" @click="removeCategory(c.id)">删除</el-button>
                  </div>
                </li>
                <li v-if="!hCategories.length" class="hs-empty">暂无分组，可直接添加</li>
              </ul>
            </div>

            <div class="hs-field hs-field-block">
              <span class="hs-field-label">人员</span>
              <div class="hs-new-row">
                <el-input v-model="newPersonName" size="small" class="hs-name" maxlength="12" placeholder="新人员名称" data-testid="hs-new-person" @keydown.enter="addPerson" />
                <el-select v-model="newPersonCategory" size="small" class="hs-person-cat" clearable placeholder="未分类" data-testid="hs-new-person-category">
                  <el-option v-for="c in hCategories" :key="c.id" :label="c.name" :value="c.id" />
                </el-select>
                <el-button size="small" class="btn-add" :disabled="!newPersonName.trim()" data-testid="hs-add-person" @click="addPerson">＋ 添加人员</el-button>
              </div>
              <ul class="hs-list">
                <li v-for="person in hPersons" :key="person.id" class="hs-row" :data-testid="`hs-person-${person.id}`">
                  <span class="hs-icon"><Icon name="account-multiple" :size="16" /></span>
                  <el-input
                    class="hs-name"
                    size="small"
                    maxlength="12"
                    :model-value="draftOf(person.id, person.name)"
                    :data-testid="`hs-person-name-${person.id}`"
                    @update:model-value="setDraft(person.id, $event)"
                    @blur="commitPersonName(person.id)"
                    @keydown.enter="commitPersonName(person.id)"
                  />
                  <el-select
                    size="small"
                    class="hs-person-cat"
                    :model-value="person.categoryId ?? ''"
                    clearable
                    placeholder="未分类"
                    :data-testid="`hs-person-category-${person.id}`"
                    @update:model-value="setPersonCategory(person.id, $event ?? '')"
                  >
                    <el-option v-for="c in hCategories" :key="c.id" :label="c.name" :value="c.id" />
                  </el-select>
                  <div class="hs-actions">
                    <span class="hs-record-count">{{ recordCountOf(person.id) }} 条</span>
                    <el-button size="small" class="btn-delete" :data-testid="`hs-person-delete-${person.id}`" @click="removePerson(person.id)">删除</el-button>
                  </div>
                </li>
                <li v-if="!hPersons.length" class="hs-empty">暂无人员，添加后即可在身高面板记录</li>
              </ul>
            </div>
          </section>
        </div>
      </section>
    </div>

    <IconPickerDialog
      v-if="iconPickerOpen"
      title="健康管理 · 选择图标"
      :current="settings.healthPageIcon"
      teleport
      @select="onPickIcon"
      @close="iconPickerOpen = false"
    />

    <template #footer>
      <el-button size="small" type="primary" data-testid="hs-settings-close" @click="emit('close')">完成</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 基类 .bd-body 的「归零内边距 + 纵向 flex」由 BaseDialog 的 body-layout="flex-column" 提供
   （见模板）；不能写成 `.hs-dialog :deep(.bd-body)` —— 根节点是 Teleport，父 scope id 打不到。
   高度由 BaseDialog 的 max-height(86vh) 接管，内容区自适应填满。 */

.hs-layout {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 1;
  min-height: min(50vh, 460px);
}

/* 左侧设置项导航 rail（与智能工作台设置弹框同构） */
.hs-rail {
  flex: 0 0 180px;
  width: 180px;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  border-right: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 10px) 0 0 var(--radius-md, 10px);
  background-color: var(--color-bg-hover, #f1f5f9);
  overflow-y: auto;
}
.hs-rail-group-label {
  padding: 0 var(--space-2) var(--space-2);
  font-size: var(--fs-caption, 12px);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}
.hs-rail-nav { display: flex; flex-direction: column; gap: 2px; }
.hs-rail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md, 10px);
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--fs-sm, 13px);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.hs-rail-item:hover { background-color: var(--color-bg-card, #ffffff); color: var(--color-text); }
.hs-rail-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary-text);
  font-weight: 600;
}
.hs-rail-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 右侧内容区 */
.hs-content {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-card, #ffffff);
  border-radius: 0 var(--radius-md, 10px) var(--radius-md, 10px) 0;
  overflow: hidden;
}
.hs-content-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-shrink: 0;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}
.hs-crumb { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm, 13px); min-width: 0; }
.hs-crumb-item {
  color: var(--color-text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hs-saved-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid rgba(22, 163, 74, 0.25);
  border-radius: 999px;
  background-color: rgba(22, 163, 74, 0.1);
  color: var(--color-success-text);
  font-size: var(--fs-caption, 12px);
  white-space: nowrap;
}
.hs-saved-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-success, #16a34a);
}
.hs-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4);
  -webkit-overflow-scrolling: touch;
}

/* 通用区块 */
.hs-pane { display: flex; flex-direction: column; gap: 12px; }
.hs-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.hs-title { margin: 0; font-size: var(--fs-body, 14px); font-weight: var(--font-weight-semibold, 600); color: var(--color-text); }
.hs-hint { margin: 0; font-size: var(--fs-caption, 12px); line-height: 1.6; color: var(--color-text-secondary); }

/* 常规字段 */
.hs-field { display: flex; align-items: flex-start; gap: 12px; }
.hs-field-switch { align-items: center; }
.hs-field-label {
  flex: 0 0 64px;
  padding-top: 6px;
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary);
}
.hs-text-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--fs-sm, 13px);
}
.hs-text-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
.hs-field-tip { flex: 1 1 auto; font-size: var(--fs-caption, 12px); color: var(--color-text-muted); }
.hs-icon-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hs-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-hover, #f8fafc);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.hs-icon-btn.is-set { border-color: var(--color-primary, #3b82f6); color: var(--color-primary); }
.hs-icon-img { width: 24px; height: 24px; object-fit: contain; border-radius: 4px; }
.hs-icon-clear {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: transparent;
  color: var(--color-text-secondary);
  font-size: var(--fs-caption, 12px);
  cursor: pointer;
}

/* 菜单列表 */
.hs-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.hs-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 8px);
  background-color: var(--color-bg-card, #ffffff);
}
.hs-row.is-hidden { opacity: 0.55; }
.hs-row.is-dragover { border-color: var(--color-primary, #3b82f6); }
.hs-drag { flex: 0 0 auto; color: var(--color-text-muted); cursor: grab; font-size: var(--fs-body, 14px); }
.hs-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: var(--color-text-secondary);
}
.hs-name { flex: 1 1 auto; min-width: 0; }
.hs-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; }

html.dark .hs-rail { background-color: var(--color-bg-hover, #111827); border-color: var(--color-border, #374151); }
html.dark .hs-content { background-color: var(--color-bg-card, #1f2937); }
html.dark .hs-row { background-color: var(--color-bg-card, #1f2937); border-color: var(--color-border, #374151); }
html.dark .hs-text-input { background-color: var(--color-bg-card, #1f2937); border-color: var(--color-border, #374151); }

/* 身高设置：分组 / 人员两块纵向排布 */
.hs-field-block { flex-direction: column; align-items: stretch; gap: var(--space-2); }
.hs-new-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.hs-new-row .hs-name { flex: 1 1 160px; }
.hs-person-cat { width: 120px; flex: none; }
.hs-record-count { font-size: var(--fs-caption); color: var(--color-text-muted); white-space: nowrap; }
.hs-empty { padding: var(--space-2); font-size: var(--fs-caption); color: var(--color-text-muted); }
@media (max-width: 768px) {
  .hs-person-cat { width: 100%; }
  .hs-new-row .hs-name { flex: 1 1 100%; }
}
</style>
