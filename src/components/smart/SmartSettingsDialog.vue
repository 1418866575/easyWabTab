<script setup lang="ts">
/**
 * 智能工作台 · 设置弹窗
 * ------------------------------------------------------------------
 * 两个模块，改动即时生效并落盘（走 nav prefs → smart.json 云同步信封）：
 *   1. 左侧菜单：改名 / 显示隐藏 / 拖拽排序（顺序规则在 smartSettingsCore，纯函数）
 *   2. 技能分类：新增 / 重命名 / 删除（二次确认），为分类添加或移除技能，空列表给空状态
 * 视觉沿用项目既有规范：CSS 变量配色、radius 圆角、与 AppSettingsDialog 同款的开关与行内列表。
 */
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { useSmartStore } from '@/stores/smart'
import { useToast } from '@/composables/useToast'
import { showConfirm } from '@/utils/dialog'
import { SMART_MENU_LABEL_MAX } from '@/composables/smartSettingsCore'
import type { SmartSkill } from '@/types'

const emit = defineEmits<{ close: [] }>()

const store = useSmartStore()
const toast = useToast()

type TabKey = 'menu' | 'categories'
const tab = ref<TabKey>('menu')

// ==================== 模块一：左侧菜单 ====================

/** 改名草稿：key → 输入框当前值（未提交不落库） */
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
  store.onRenameMenu(key, v)
  const next = { ...menuEditing.value }
  delete next[key]
  menuEditing.value = next
}

function revertMenuName(key: string): void {
  const next = { ...menuEditing.value }
  delete next[key]
  menuEditing.value = next
}

function onDragStart(index: number, e: DragEvent): void {
  dragFrom.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 需要写入数据才会触发 drop
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragEnter(index: number): void {
  if (dragFrom.value !== null) dragOver.value = index
}

function onDrop(index: number): void {
  const from = dragFrom.value
  if (from !== null && from !== index) store.onReorderMenu(from, index)
  dragFrom.value = null
  dragOver.value = null
}

function onDragEnd(): void {
  dragFrom.value = null
  dragOver.value = null
}

/** 切换显示 / 隐藏：被守卫拦下时给出提示而不是静默无反应 */
function onToggleMenuHidden(key: string): void {
  if (!store.onToggleMenuHidden(key)) {
    toast.warning('至少要保留一个可见的菜单项')
  }
}

async function onResetMenu(): Promise<void> {
  if (!(await showConfirm('确定恢复左侧菜单的默认名称、顺序与显示状态吗？'))) return
  store.resetMenu()
  menuEditing.value = {}
  toast.success('已恢复默认菜单')
}

// ==================== 模块二：技能分类 ====================

const newCategoryName = ref('')
const categoryEditing = ref<Record<string, string>>({})
const expanded = ref<string | null>(null)
/** 分类 → 「添加技能」下拉当前选中项 */
const pickOf = ref<Record<string, string>>({})

const categories = computed(() => store.allSkillCategories)

function skillsOf(name: string): SmartSkill[] {
  return store.skills.filter(s => s.category === name)
}

/** 可加入该分类的技能（即当前不在该分类里的） */
function assignableSkills(name: string): SmartSkill[] {
  return store.skills.filter(s => s.category !== name)
}

async function onAddCategory(): Promise<void> {
  const r = store.onAddCategory(newCategoryName.value)
  if (!r.ok) {
    toast.error(r.error ?? '新增分类失败')
    return
  }
  newCategoryName.value = ''
  toast.success('分类已新增')
}

function onCategoryInput(name: string, v: string): void {
  categoryEditing.value = { ...categoryEditing.value, [name]: v }
}

function commitCategoryName(oldName: string): void {
  const v = categoryEditing.value[oldName]
  if (v === undefined) return
  const r = store.onRenameCategory(oldName, v)
  const next = { ...categoryEditing.value }
  delete next[oldName]
  categoryEditing.value = next
  if (!r.ok) {
    toast.error(r.error ?? '重命名失败')
    return
  }
  if (expanded.value === oldName) expanded.value = v.trim()
  toast.success('分类已重命名')
}

function revertCategoryName(name: string): void {
  const next = { ...categoryEditing.value }
  delete next[name]
  categoryEditing.value = next
}

async function onDeleteCategory(name: string): Promise<void> {
  const count = store.skillCountByCategory[name] ?? 0
  const msg = count > 0
    ? `确定删除分类「${name}」吗？该分类下的 ${count} 个技能会移到「未分类」，技能本身不会被删除。`
    : `确定删除分类「${name}」吗？`
  if (!(await showConfirm(msg))) return
  const moved = store.onDeleteCategory(name)
  if (expanded.value === name) expanded.value = null
  toast.success(moved > 0 ? `已删除分类，${moved} 个技能移到「未分类」` : '分类已删除')
}

function onAddSkillTo(category: string): void {
  const id = pickOf.value[category]
  if (!id) {
    toast.warning('请先选择一个技能')
    return
  }
  store.onAssignSkillToCategory(id, category)
  const next = { ...pickOf.value }
  delete next[category]
  pickOf.value = next
  toast.success('已加入该分类')
}

function onRemoveSkill(skillId: string): void {
  store.onRemoveSkillFromCategory(skillId)
  toast.success('已移出该分类')
}

function toggleExpand(name: string): void {
  expanded.value = expanded.value === name ? null : name
}
</script>

<template>
  <el-dialog :model-value="true" width="760px" title="智能工作台设置" :close-on-click-modal="false" @close="emit('close')">
    <div class="ss-wrap">
      <!-- 模块切换 -->
      <div class="ss-tabs" role="tablist">
        <button
          type="button"
          class="ss-tab"
          :class="{ 'is-on': tab === 'menu' }"
          role="tab"
          :aria-selected="tab === 'menu'"
          data-testid="smart-settings-tab-menu"
          @click="tab = 'menu'"
        >左侧菜单</button>
        <button
          type="button"
          class="ss-tab"
          :class="{ 'is-on': tab === 'categories' }"
          role="tab"
          :aria-selected="tab === 'categories'"
          data-testid="smart-settings-tab-categories"
          @click="tab = 'categories'"
        >技能分类</button>
      </div>

      <!-- ============ 左侧菜单 ============ -->
      <section v-if="tab === 'menu'" class="ss-pane">
        <div class="ss-head">
          <h3 class="ss-title">左侧菜单</h3>
          <el-button size="small" data-testid="smart-menu-reset" @click="onResetMenu">恢复默认</el-button>
        </div>
        <p class="ss-hint">
          拖动左侧手柄调整顺序，直接改名，右侧开关控制显示或隐藏；改动即时生效并随云同步保存。
        </p>

        <ul class="ss-list">
          <li
            v-for="(item, index) in store.menuItems"
            :key="item.key"
            class="ss-row"
            :class="{ 'is-hidden': item.hidden, 'is-dragover': dragOver === index }"
            :data-testid="`smart-menu-row-${item.key}`"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragenter.prevent="onDragEnter(index)"
            @dragover.prevent
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
          >
            <span class="ss-drag" aria-hidden="true">⠿</span>
            <span class="ss-icon"><Icon :name="item.icon" :size="16" /></span>
            <el-input
              class="ss-name"
              size="small"
              :maxlength="SMART_MENU_LABEL_MAX"
              :model-value="menuValue(item.key, item.label)"
              :aria-label="`${item.label}名称`"
              :data-testid="`smart-menu-name-${item.key}`"
              @update:model-value="onMenuInput(item.key, $event)"
              @blur="commitMenuName(item.key)"
              @keydown.enter="commitMenuName(item.key)"
              @keydown.esc.stop="revertMenuName(item.key)"
            />
            <div class="ss-actions">
              <el-button
                size="small"
                :data-testid="`smart-menu-up-${item.key}`"
                :disabled="index === 0"
                @click="store.onMoveMenu(item.key, 'up')"
              >上移</el-button>
              <el-button
                size="small"
                :data-testid="`smart-menu-down-${item.key}`"
                :disabled="index === store.menuItems.length - 1"
                @click="store.onMoveMenu(item.key, 'down')"
              >下移</el-button>
              <button
                type="button"
                class="switch-btn"
                :class="{ on: !item.hidden }"
                role="switch"
                :aria-checked="!item.hidden"
                :aria-label="`显示${item.label}`"
                :data-testid="`smart-menu-toggle-${item.key}`"
                @click="onToggleMenuHidden(item.key)"
              >
                <span class="switch-thumb"></span>
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- ============ 技能分类 ============ -->
      <section v-else class="ss-pane">
        <div class="ss-head">
          <h3 class="ss-title">技能分类</h3>
          <div class="ss-add">
            <el-input
              v-model="newCategoryName"
              size="small"
              class="ss-add-input"
              maxlength="20"
              placeholder="新分类名称"
              data-testid="smart-cat-new"
              @keydown.enter="onAddCategory"
            />
            <el-button size="small" type="primary" data-testid="smart-cat-add" @click="onAddCategory">＋ 新增分类</el-button>
          </div>
        </div>
        <p class="ss-hint">
          分类用于技能分组筛选。重命名会同步更新该分类下的技能；删除分类只会把技能移到「未分类」，不会删除技能本身。
        </p>

        <ul v-if="categories.length" class="ss-list">
          <li v-for="c in categories" :key="c" class="ss-row is-cat" :data-testid="`smart-cat-row-${c}`">
            <div class="ss-cat-main">
              <span class="ss-icon"><Icon name="folder" :size="16" /></span>
              <el-input
                class="ss-name"
                size="small"
                maxlength="20"
                :model-value="categoryEditing[c] ?? c"
                :aria-label="`${c}名称`"
                :data-testid="`smart-cat-name-${c}`"
                @update:model-value="onCategoryInput(c, $event)"
                @blur="commitCategoryName(c)"
                @keydown.enter="commitCategoryName(c)"
                @keydown.esc.stop="revertCategoryName(c)"
              />
              <span class="ss-count">{{ store.skillCountByCategory[c] ?? 0 }} 个技能</span>
              <div class="ss-actions">
                <el-button
                  size="small"
                  :data-testid="`smart-cat-expand-${c}`"
                  @click="toggleExpand(c)"
                >{{ expanded === c ? '收起' : '管理技能' }}</el-button>
                <el-button
                  size="small"
                  class="is-danger"
                  :data-testid="`smart-cat-del-${c}`"
                  @click="onDeleteCategory(c)"
                >删除</el-button>
              </div>
            </div>

            <div v-if="expanded === c" class="ss-cat-detail">
              <div class="ss-add">
                <el-select
                  size="small"
                  class="ss-pick"
                  :model-value="pickOf[c] ?? ''"
                  placeholder="选择要加入的技能"
                  :data-testid="`smart-cat-pick-${c}`"
                  @update:model-value="pickOf = { ...pickOf, [c]: $event }"
                >
                  <el-option v-for="s in assignableSkills(c)" :key="s.id" :value="s.id" :label="s.name" />
                </el-select>
                <el-button size="small" :data-testid="`smart-cat-assign-${c}`" @click="onAddSkillTo(c)">加入该分类</el-button>
              </div>

              <ul v-if="skillsOf(c).length" class="ss-skill-list">
                <li v-for="s in skillsOf(c)" :key="s.id" class="ss-skill-row">
                  <span class="ss-skill-name">{{ s.name }}</span>
                  <el-button
                    size="small"
                    :data-testid="`smart-cat-remove-${s.id}`"
                    @click="onRemoveSkill(s.id)"
                  >移出</el-button>
                </li>
              </ul>
              <p v-else class="ss-empty-inline">该分类下还没有技能，从上方选择加入。</p>
            </div>
          </li>
        </ul>

        <!-- 空状态 -->
        <div v-else class="ss-empty">
          <p class="ss-empty-title">还没有分类</p>
          <p class="ss-empty-hint">
            {{ store.skills.length ? '你的技能都还没归类；新增一个分类（如「写作」「研发」），再把技能加进去。' : '先新增几个技能，再用分类把它们分组管理。' }}
          </p>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="ss-footer">
        <el-button size="small" type="primary" data-testid="smart-settings-close" @click="emit('close')">完成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.ss-wrap { display: flex; flex-direction: column; gap: 12px; }

/* ---------- 模块切换 ---------- */
.ss-tabs { display: flex; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border, #e2e8f0); }
.ss-tab {
  min-height: 28px;
  padding: 4px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.ss-tab:hover { background-color: var(--color-bg-hover, #f1f5f9); }
.ss-tab.is-on {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: var(--font-weight-medium, 500);
}

/* ---------- 通用区块 ---------- */
.ss-pane { display: flex; flex-direction: column; gap: 10px; max-height: 56vh; overflow-y: auto; }
.ss-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ss-title { margin: 0; font-size: 14px; font-weight: var(--font-weight-semibold, 600); color: var(--color-text, #0f172a); }
.ss-hint { margin: 0; font-size: 12px; line-height: 1.6; color: var(--color-text-secondary, #64748b); }

.ss-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }

.ss-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 8px);
  background-color: var(--color-bg-card, #ffffff);
}
.ss-row.is-cat { flex-direction: column; align-items: stretch; gap: 8px; }
.ss-row.is-hidden { opacity: 0.55; }
.ss-row.is-dragover { border-color: var(--color-primary, #3b82f6); }

.ss-drag { flex: 0 0 auto; color: var(--color-text-muted, #94a3b8); cursor: grab; font-size: 14px; }
.ss-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: var(--color-text-secondary, #64748b);
}
.ss-name { flex: 1 1 auto; min-width: 0; }
.ss-count { flex: 0 0 auto; font-size: 12px; color: var(--color-text-muted, #94a3b8); }
.ss-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; }

.ss-cat-main { display: flex; align-items: center; gap: 10px; }
.ss-cat-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-sm, 8px);
  background-color: var(--color-bg-hover, #f1f5f9);
}
.ss-add { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ss-add-input { width: 160px; }
.ss-pick { flex: 1 1 200px; min-width: 0; }

.ss-skill-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ss-skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 8px);
  background-color: var(--color-bg-card, #ffffff);
}
.ss-skill-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text, #0f172a);
}
.ss-empty-inline { margin: 0; font-size: 12px; color: var(--color-text-muted, #94a3b8); }

/* 删除按钮：与技能/提示词列表同款的危险色（命中 el-button 根节点） */
.is-danger { color: var(--color-error, #dc2626); }
.is-danger:hover {
  border-color: var(--color-error, #dc2626);
  color: var(--color-error, #dc2626);
  background-color: transparent;
}

/* ---------- 空状态 ---------- */
.ss-empty {
  padding: 28px 16px;
  text-align: center;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
}
.ss-empty-title { margin: 0 0 4px; font-size: 14px; font-weight: var(--font-weight-semibold, 600); color: var(--color-text, #0f172a); }
.ss-empty-hint { margin: 0; font-size: 12px; color: var(--color-text-secondary, #64748b); }

.ss-footer { display: flex; justify-content: flex-end; }

/* ---------- 开关（与 AppSettingsDialog 同款） ---------- */
.switch-btn {
  flex: 0 0 auto;
  position: relative;
  width: 40px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-hover, #f1f5f9);
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    border-color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.switch-btn .switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: var(--color-text-muted, #94a3b8);
  transition: transform var(--motion-duration, 0.2s) var(--motion-ease, ease),
    background-color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.switch-btn.on {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}
.switch-btn.on .switch-thumb {
  transform: translateX(18px);
  background-color: #ffffff;
}

/* ---------- 移动端：触控目标 ≥44px ---------- */
@media (max-width: 768px) {
  .ss-tab { min-height: 44px; padding: 8px 16px; font-size: 14px; }
  .ss-row { flex-wrap: wrap; }
  .ss-add-input { width: 100%; }
  .ss-pick { flex: 1 1 100%; }
}
</style>
