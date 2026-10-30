<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'
import { ref, computed } from 'vue'
import { useSearchEnginesStore } from '../stores/searchEngines'
import type { SearchEngine } from '../stores/searchEngines'

/** embedded = true：作为常驻面板内嵌在设置页（无遮罩、无自带标题栏、不响应遮罩点击关闭） */
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

/** 面板尺寸：沿用「设置 → 弹窗尺寸」写入的 CSS 变量（engine），未配置时回退默认值 */
const PANEL_WIDTH = 'var(--dlg-w-engine, 700px)'
const PANEL_MAX_HEIGHT = 'var(--dlg-h-engine, 80vh)'

const emit = defineEmits<{
  close: []
}>()

const store = useSearchEnginesStore()

const newEngineName = ref('')
const newEngineUrl = ref('')
const newEngineQuery = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingUrl = ref('')

// 内置引擎编辑状态
const builtInEditingId = ref<string | null>(null)
const builtInEditingUrl = ref('')

// 按排序显示
const sortedEngines = computed(() => 
  [...store.allEngines].filter(e => !e.isBuiltIn).sort((a, b) => a.sort - b.sort)
)

// 添加引擎
function handleAdd() {
  if (!newEngineName.value.trim() || !newEngineUrl.value.trim()) return
  
  let url = newEngineUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  
  const query = newEngineQuery.value.trim() || 'q='
  const fullUrl = url + (url.endsWith('/') ? '' : '/') + '?' + query
  
  store.addEngine(newEngineName.value.trim(), fullUrl)
  newEngineName.value = ''
  newEngineUrl.value = ''
  newEngineQuery.value = ''
}

// 开始编辑
function startEdit(engine: SearchEngine) {
  editingId.value = engine.id
  editingName.value = engine.name
  editingUrl.value = engine.url
}

// 取消编辑
function cancelEdit() {
  editingId.value = null
  editingName.value = ''
  editingUrl.value = ''
}

// 保存编辑
async function saveEdit() {
  if (!editingId.value || !editingName.value.trim()) return
  
  store.updateEngine(editingId.value, {
    name: editingName.value.trim(),
    url: editingUrl.value.trim()
  })
  cancelEdit()
}

// 设置默认引擎（全局唯一，设置新的会自动取消旧的）
function handleSetDefault(engine: SearchEngine) {
  if (engine.id === store.defaultEngineId) return
  const previousName = store.defaultEngine?.name || '原引擎'
  if (!store.setDefault(engine.id)) {
    toastAlert(`设置默认引擎失败，仍保持「${previousName}」为默认`)
    return
  }
  toastAlert(`已将「${engine.name}」设为默认搜索引擎`)
}

// 删除引擎（删除前若它是默认引擎，提示默认状态将转移到哪个引擎）
async function handleDelete(engine: SearchEngine) {
  const fallbackName = store.getFallbackDefaultName(engine.id)
  const message = fallbackName
    ? `「${engine.name}」是当前默认引擎，删除后默认引擎将切换为「${fallbackName}」。确定删除吗？`
    : `确定要删除搜索引擎「${engine.name}」吗？`
  if (!(await showConfirm(message))) return

  const result = store.deleteEngine(engine.id)
  if (!result.ok) {
    toastAlert('删除失败，请重试')
    return
  }
  if (result.transferredTo) {
    toastAlert(`默认引擎已切换为「${result.transferredTo}」`)
  }
}

// 启用 / 禁用引擎（禁用默认引擎时提示并自动转移默认状态）
async function handleToggleEnabled(engine: SearchEngine) {
  if (engine.disabled) {
    if (!store.setEngineEnabled(engine.id, true).ok) {
      toastAlert('启用失败，请重试')
    }
    return
  }

  const fallbackName = store.getFallbackDefaultName(engine.id)
  const message = fallbackName
    ? `「${engine.name}」是当前默认引擎，禁用后默认引擎将切换为「${fallbackName}」。确定禁用吗？`
    : `确定要禁用搜索引擎「${engine.name}」吗？禁用后将不在搜索框的引擎列表中出现。`
  if (!(await showConfirm(message))) return

  const result = store.setEngineEnabled(engine.id, false)
  if (!result.ok) {
    toastAlert('禁用失败，请重试')
    return
  }
  if (result.transferredTo) {
    toastAlert(`「${engine.name}」已禁用，默认引擎已切换为「${result.transferredTo}」`)
  }
}

// 移动排序
async function handleMove(id: string, direction: 'up' | 'down') {
  store.moveEngine(id, direction)
}

// 恢复默认引擎
async function handleReset() {
  if (await showConfirm('确定要恢复默认搜索引擎吗？当前自定义引擎将被覆盖。')) {
    store.resetToDefault()
  }
}

// 开始编辑内置引擎 URL
function startEditBuiltIn(engine: SearchEngine) {
  builtInEditingId.value = engine.id
  builtInEditingUrl.value = engine.url
}

// 取消编辑内置引擎
function cancelEditBuiltIn() {
  builtInEditingId.value = null
  builtInEditingUrl.value = ''
}

// 保存内置引擎 URL
function saveBuiltInUrl() {
  if (!builtInEditingId.value || !builtInEditingUrl.value.trim()) return
  store.updateBuiltInEngineUrl(builtInEditingId.value, builtInEditingUrl.value.trim())
  builtInEditingId.value = null
  builtInEditingUrl.value = ''
}

// 截断 URL 显示
function truncateUrl(url: string, maxLength = 40) {
  if (url.length <= maxLength) return url
  return url.slice(0, maxLength) + '...'
}
</script>

<template>
  <Transition name="dialog">
    <BaseDialog
      title="搜索引擎管理"
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      :embedded="embedded"
      :hide-header="embedded"
      :close-on-overlay="!embedded"
      @close="emit('close')"
    >
      <!-- 添加新引擎 -->
      <div class="add-form">
        <h3>添加搜索引擎</h3>
        <div class="form-row">
          <input
            v-model="newEngineName"
            type="text"
            placeholder="名称，如：百度"
            class="input-name"
          />
          <input
            v-model="newEngineUrl"
            type="text"
            placeholder="网址，如：https://baidu.com"
            class="input-url"
          />
        </div>
        <div class="form-row">
          <input
            v-model="newEngineQuery"
            type="text"
            placeholder="查询参数，如：wd= (会自动拼接到URL后)"
            class="input-query"
          />
          <button
            class="btn-add"
            @click="handleAdd"
            :disabled="!newEngineName.trim() || !newEngineUrl.trim()"
          >
            添加
          </button>
        </div>
      </div>

      <!-- 内置引擎 -->
      <div class="engine-section">
        <h3>内置引擎 (不可删除)</h3>
        <button class="btn-reset" @click="handleReset">恢复默认引擎</button>
        <div
          v-for="engine in store.builtInEngines"
          :key="engine.id"
          class="engine-item built-in"
          :class="{ 'is-default': engine.isDefault, 'is-disabled': engine.disabled }"
        >
          <div class="sort-controls">
            <span class="lock-icon"><Icon name="lock" /></span>
          </div>

          <!-- 编辑模式 -->
          <template v-if="builtInEditingId === engine.id">
            <input
              v-model="builtInEditingUrl"
              type="text"
              class="edit-input url built-in-url"
              placeholder="URL"
            />
            <button class="btn-icon" @click="saveBuiltInUrl"><Icon name="check" /></button>
            <button class="btn-icon" @click="cancelEditBuiltIn"><Icon name="close" /></button>
          </template>

          <!-- 显示模式 -->
          <template v-else>
            <span class="engine-name">
              {{ engine.name }}
              <span v-if="engine.isDefault" class="default-tag">默认</span>
              <span v-if="engine.disabled" class="disabled-tag">已禁用</span>
            </span>
            <span class="engine-url" :title="engine.url">{{ truncateUrl(engine.url) }}</span>
            <button
              v-if="engine.id !== 'local'"
              class="btn-icon"
              @click="startEditBuiltIn(engine)"
              title="编辑URL"
            ><Icon name="pencil" /></button>
            <button
              class="btn-icon set-default"
              :class="{ 'is-active': engine.isDefault }"
              :disabled="engine.isDefault"
              :title="engine.isDefault ? '当前默认引擎' : '设为默认引擎'"
              :data-testid="`builtin-default-${engine.id}`"
              @click="handleSetDefault(engine)"
            ><Icon name="star" /></button>
            <button
              class="btn-icon toggle"
              :title="engine.disabled ? '启用引擎' : '禁用引擎'"
              :data-testid="`builtin-toggle-${engine.id}`"
              @click="handleToggleEnabled(engine)"
            ><Icon :name="engine.disabled ? 'eye-off' : 'eye'" /></button>
          </template>
        </div>
      </div>

      <!-- 自定义引擎 -->
      <div class="engine-section">
        <h3>自定义引擎 ({{ sortedEngines.length }})</h3>

        <div
          v-for="engine in sortedEngines"
          :key="engine.id"
          class="engine-item custom"
          :class="{ 'is-default': engine.isDefault, 'is-disabled': engine.disabled }"
        >
          <template v-if="editingId === engine.id">
            <input
              v-model="editingName"
              type="text"
              class="edit-input name"
              placeholder="名称"
            />
            <input
              v-model="editingUrl"
              type="text"
              class="edit-input url"
              placeholder="URL"
            />
            <button class="btn-icon" @click="saveEdit"><Icon name="check" /></button>
            <button class="btn-icon" @click="cancelEdit"><Icon name="close" /></button>
          </template>
          <template v-else>
            <div class="sort-controls">
              <button
                class="btn-sort"
                @click="handleMove(engine.id, 'up')"
                :disabled="!store.canMove(engine.id, 'up')"
                title="上移"
              >↑</button>
              <button
                class="btn-sort"
                @click="handleMove(engine.id, 'down')"
                :disabled="!store.canMove(engine.id, 'down')"
                title="下移"
              >↓</button>
            </div>
            <span class="engine-name">
              {{ engine.name }}
              <span v-if="engine.isDefault" class="default-tag">默认</span>
              <span v-if="engine.disabled" class="disabled-tag">已禁用</span>
            </span>
            <span class="engine-url" :title="engine.url">{{ truncateUrl(engine.url) }}</span>
            <button class="btn-icon" @click="startEdit(engine)"><Icon name="pencil" /></button>
            <button
              class="btn-icon set-default"
              :class="{ 'is-active': engine.isDefault }"
              :disabled="engine.isDefault"
              :title="engine.isDefault ? '当前默认引擎' : '设为默认引擎'"
              :data-testid="`custom-default-${engine.id}`"
              @click="handleSetDefault(engine)"
            ><Icon name="star" /></button>
            <button
              class="btn-icon toggle"
              :title="engine.disabled ? '启用引擎' : '禁用引擎'"
              :data-testid="`custom-toggle-${engine.id}`"
              @click="handleToggleEnabled(engine)"
            ><Icon :name="engine.disabled ? 'eye-off' : 'eye'" /></button>
            <button class="btn-icon delete" @click="handleDelete(engine)"><Icon name="trash" /></button>
          </template>
        </div>
      </div>
    </BaseDialog>
  </Transition>
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体/底部/移动端适配）已统一到 common/BaseDialog.vue，
   本组件仅保留引擎列表、添加表单等内容样式 */

.add-form {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.add-form h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  margin: 0 0 12px 0;
}

.form-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.input-name {
  width: 120px;
}

.input-url {
  flex: 1;
}

.input-query {
  flex: 1;
}

/* 表单输入：对齐全局 .ui-input（36px 高 / 8px 圆角 / 13px 字 / 同款焦点环）。
   原来 10px 上下内边距 + 14px 字号 → 38px 高，比同排按钮高 2px */
/* 输入框视觉统一到全局 .ui-input（.input-name / .input-url / .input-query 已在别名列表） */

.btn-add {
  white-space: nowrap;
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.btn-add:hover:not(:disabled) {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.btn-add:disabled {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.engine-list h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  margin: 0 0 12px 0;
}

.empty-state {
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  font-size: 14px;
  padding: 20px;
  background: var(--color-bg, #f8fafc);
  border-radius: 8px;
}

.engine-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 8px;
}

.engine-item.is-default {
  background: #fef3c7;
  border-color: #fbbf24;
}

/* 已禁用引擎：弱化显示，与「默认」高亮区分 */
.engine-item.is-disabled {
  background: var(--color-bg, #f8fafc);
  border-color: var(--color-border, #e2e8f0);
  border-style: dashed;
}

.engine-item.is-disabled .engine-name,
.engine-item.is-disabled .engine-url {
  color: var(--color-text-muted, #94a3b8);
}

.disabled-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--color-bg-active, #e2e8f0);
  color: var(--color-text-secondary, #64748b);
  border-radius: 4px;
}

.sort-controls {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 上/下移排序：原 20×16 + 10px 字，低于 24px 的可点区域下限；放大到 24×24 */
.btn-sort {
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--color-bg-hover, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-sort:hover:not(:disabled) {
  background: var(--color-bg-active, #e2e8f0);
  color: var(--color-primary, #3b82f6);
}

.btn-sort:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.engine-name {
  flex: 1;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text, #1e293b);
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.engine-url {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.default-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: #fbbf24;
  color: white;
  border-radius: 4px;
}

/* 输入框视觉统一到全局 .ui-input，这里只保留宽度布局（见下方 .edit-input.name/.url） */

.edit-input.name {
  width: 100px;
}

.edit-input.url {
  flex: 1;
}

.edit-input.url.built-in-url {
  min-width: 250px;
}

/* 行内图标操作按钮（编辑/删除/设为默认/启用开关）：对齐全局 .ui-btn--sm 的尺寸，
   原先无边框无圆角、14px 字，和左边 13px 的输入框不同字号 */
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  min-height: 30px;
  padding: 0 var(--space-2, 8px);
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  font-size: var(--font-size-xs, 12px);
  line-height: 1;
  opacity: 0.65;
  transition: opacity 0.2s, border-color 0.2s, background-color 0.2s;
}

.btn-icon:hover {
  opacity: 1;
  border-color: var(--color-border);
  background-color: var(--color-bg-hover);
}

.btn-icon.delete:hover {
  color: var(--color-error, #ef4444);
}

/* 设为默认：未选中为常规图标按钮，已是默认时高亮为金色且不可点击 */
.btn-icon.set-default:hover {
  color: #fbbf24;
}

.btn-icon.set-default.is-active {
  opacity: 1;
  color: #f59e0b;
}

.btn-icon.set-default:disabled {
  cursor: default;
}

.btn-icon.toggle:hover {
  color: var(--color-primary, #3b82f6);
}

.btn-reset {
  margin-bottom: 12px;
  /* 视觉已统一到全局 .ui-btn（style.css） */
}

.btn-reset:hover {
  /* 视觉已统一到全局 .ui-btn（style.css） */
}
</style>
