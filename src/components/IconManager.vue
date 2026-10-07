<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'
import { ref, computed } from 'vue'
import { useIconsStore, type MergedIcon, type CustomIcon, type IconExportData } from '@/stores/icons'
import { useSitesStore } from '@/stores/sites'
import { PRESET_ICONS, type PresetIcon } from '@/composables/presetIcons'

/** embedded = true：作为常驻面板内嵌在设置页（无遮罩、无自带标题栏） */
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

/** 面板尺寸：沿用「设置 → 弹窗尺寸」写入的 CSS 变量（icon），未配置时回退默认值 */
const PANEL_WIDTH = 'var(--dlg-w-icon, 900px)'
const PANEL_MAX_HEIGHT = 'var(--dlg-h-icon, 80vh)'

const emit = defineEmits<{
  close: []
}>()

const store = useIconsStore()
/** 站点数据：用于判定哪些图标「正在被使用」（site.icon 存图标 src，与 getIconSrc 同口径） */
const sitesStore = useSitesStore()

// 上传
const fileInput = ref<HTMLInputElement | null>(null)
const MAX_SIZE = 500 * 1024 // 500KB

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > MAX_SIZE) {
    toastAlert('图标文件不能超过 500KB')
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = async () => {
    const dataUrl = reader.result as string
    const name = prompt('请输入图标名称', file.name.replace(/\.[^.]+$/, ''))
    if (!name || !name.trim()) {
      input.value = ''
      return
    }

    try {
      await store.addIcon({
        name: name.trim(),
        label: name.trim(),
        dataUrl,
        category: activeCategory.value === '全部' ? '其他' : activeCategory.value
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? '')
      if (/Quota|配额|space|exceed/i.test(msg)) {
        toastAlert('图标保存失败：存储空间不足，请减少自定义图标数量后重试')
      } else {
        toastAlert('图标保存失败：' + (msg || '未知错误'))
      }
    } finally {
      input.value = ''
    }
  }
  reader.readAsDataURL(file)
}

// 搜索
const searchQuery = ref('')

// 分类过滤
const CATEGORIES = computed(() => {
  const presetCategories = [...new Set(PRESET_ICONS.map(icon => icon.category))]
  return ['全部', '自定义图标', ...presetCategories]
})

const activeCategory = ref('全部')

// 过滤后的图标列表
const filteredIcons = computed(() => {
  let icons: MergedIcon[]

  if (searchQuery.value.trim()) {
    icons = store.searchIcons(searchQuery.value.trim())
  } else if (activeCategory.value === '自定义图标') {
    icons = store.customIcons.map(icon => ({ ...icon, isCustom: true as const }))
  } else if (activeCategory.value !== '全部') {
    icons = store.getIconsByCategory(activeCategory.value)
  } else {
    icons = store.allIcons
  }

  return icons
})

// 内联编辑
const editingId = ref<string | null>(null)
const editingLabel = ref('')

async function startEdit(icon: MergedIcon) {
  editingId.value = 'isCustom' in icon && icon.isCustom ? icon.id : null
  editingLabel.value = icon.label
}

async function saveEdit() {
  if (!editingId.value || !editingLabel.value.trim()) return
  try {
    await store.updateIcon(editingId.value, { label: editingLabel.value.trim() })
    cancelEdit()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? '')
    toastAlert('保存失败：' + (msg || '未知错误'))
  }
}

async function cancelEdit() {
  editingId.value = null
  editingLabel.value = ''
}

// 删除
async function handleDelete(iconId: string) {
  if (!await showConfirm('确定删除该图标？')) return
  try {
    await store.deleteIcon(iconId)
    if (editingId.value === iconId) {
      cancelEdit()
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? '')
    toastAlert('删除失败：' + (msg || '未知错误'))
  }
}

// 导出
function handleExport() {
  const data: IconExportData = store.exportIcons()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `icons-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 导入
const importInput = ref<HTMLInputElement | null>(null)

function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async () => {
    // 阶段 1：JSON 解析
    let data: IconExportData
    try {
      data = JSON.parse(reader.result as string) as IconExportData
    } catch {
      toastAlert('导入失败：文件不是合法的 JSON，请确认文件未损坏或编码正确')
      input.value = ''
      return
    }
    // 阶段 2：结构校验
    if (!data || typeof data !== 'object' || data.version !== 1 || !Array.isArray(data.icons)) {
      toastAlert('导入失败：文件格式不正确（必须是 icons 导出文件，含 version=1 和 icons 数组）')
      input.value = ''
      return
    }
    // 阶段 3：持久化（store.importIcons 内部已先写持久化成功后才改内存，避免假成功）
    try {
      const { added } = await store.importIcons(data)
      if (added > 0) {
        toastAlert('导入成功：新增 ' + added + ' 个图标（重复 ID 已自动跳过）')
      } else {
        toastAlert('导入完成：没有新增图标（全部为已存在的重复 ID）')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? '')
      if (/Quota|配额|space|exceed/i.test(msg)) {
        toastAlert('导入失败：存储空间不足，请减少自定义图标后再试')
      } else if (/格式/.test(msg)) {
        toastAlert('导入失败：' + msg)
      } else {
        toastAlert('导入失败：保存图标出错 - ' + (msg || '未知错误'))
      }
    } finally {
      input.value = ''
    }
  }
  reader.readAsText(file)
}

// 获取图标预览 src
function getIconSrc(icon: MergedIcon): string {
  if ('isCustom' in icon && icon.isCustom) {
    return (icon as CustomIcon & { isCustom: true }).dataUrl
  }
  const preset = icon as PresetIcon
  return `/icons/${preset.name}.${preset.ext}`
}

// 判断是否为自定义图标
function isCustom(icon: MergedIcon): icon is CustomIcon & { isCustom: true } {
  return 'isCustom' in icon && icon.isCustom
}

// 获取图标 ID（用于模板 v-for key 和操作）
function getIconId(icon: MergedIcon): string {
  return isCustom(icon) ? icon.id : (icon as PresetIcon).name
}

// ===== 「正在使用」标识 =====
// 站点通过 site.icon 引用图标，其值就是该图标的 src（自定义=dataUrl，预置=`/icons/name.ext`），
// 与 SiteCard 渲染时的 getFaviconImgSrc(url, site.icon) 同口径，故直接按 src 精确匹配。
const usedCountByIcon = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  for (const site of sitesStore.sites) {
    const src = site.icon
    if (typeof src !== 'string' || !src) continue
    map.set(src, (map.get(src) ?? 0) + 1)
  }
  return map
})

/** 该图标被 n 个站点使用中 */
function usedCountOf(icon: MergedIcon): number {
  return usedCountByIcon.value.get(getIconSrc(icon)) ?? 0
}

/** 引用该图标的站点（用于 title 提示「被哪些站点使用」） */
function usedSiteNames(icon: MergedIcon): string {
  const src = getIconSrc(icon)
  const names = sitesStore.sites.filter(s => s.icon === src).map(s => s.name)
  return names.join('、')
}
</script>

<template>
  <Transition name="dialog">
    <BaseDialog
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      :embedded="embedded"
      :hide-header="embedded"
      :close-on-overlay="!embedded"
      @close="emit('close')"
    >
      <template #title><Icon name="palette" /> 图标管理</template>

      <!-- 导入/导出 -->
      <div class="import-export-bar">
        <input
          ref="importInput"
          type="file"
          accept=".json"
          class="hidden-file-input"
          @change="handleImport"
        />
        <button class="btn-secondary" @click="importInput?.click()">
          <Icon name="download" /> 导入
        </button>
        <button class="btn-secondary" @click="handleExport">
          <Icon name="upload" /> 导出
        </button>
        <span class="import-export-hint">
          自定义图标: {{ store.customIcons.length }} 个
        </span>
      </div>

      <!-- 上传区域 -->
      <div class="add-form">
        <h3>上传图标</h3>
        <div class="add-form-row">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden-file-input"
            @change="handleUpload"
          />
          <button class="btn-add" @click="fileInput?.click()">
            <Icon name="folder" /> 选择文件
          </button>
          <span class="upload-hint">支持 PNG/SVG/GIF，最大 500KB</span>
        </div>
      </div>

      <!-- 搜索 + 分类过滤 -->
      <div class="filter-bar">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索图标名称..."
        />
      </div>

      <div class="category-tabs">
        <button
          v-for="cat in CATEGORIES"
          :key="cat"
          class="category-tab"
          :class="{ active: activeCategory === cat }"
          @click="activeCategory = cat"
        >
          {{ cat }}
        </button>
      </div>

      <!-- 图标网格 -->
      <div class="icon-manager-grid">
        <div
          v-for="icon in filteredIcons"
          :key="getIconId(icon)"
          class="icon-manager-item"
          :class="{ 'built-in': !isCustom(icon), custom: isCustom(icon), 'is-used': usedCountOf(icon) > 0 }"
        >
          <!-- 使用中角标：该图标正被站点引用 -->
          <span
            v-if="usedCountOf(icon) > 0"
            class="icon-used-badge"
            :title="`正在被 ${usedCountOf(icon)} 个站点使用：${usedSiteNames(icon)}`"
            data-testid="icon-used-badge"
          >{{ usedCountOf(icon) }} 使用中</span>
          <!-- 编辑模式 -->
          <template v-if="isCustom(icon) && editingId === getIconId(icon)">
            <div class="icon-manager-preview">
              <img :src="getIconSrc(icon)" :alt="icon.label" />
            </div>
            <input
              v-model="editingLabel"
              type="text"
              class="edit-input"
              @keyup.enter="saveEdit"
              @keyup.escape="cancelEdit"
            />
            <div class="icon-manager-meta">
              <span class="icon-manager-category">{{ icon.category }}</span>
            </div>
            <div class="icon-manager-actions">
              <button class="btn-icon" @click="saveEdit"><Icon name="check" /></button>
              <button class="btn-icon" @click="cancelEdit"><Icon name="close" /></button>
            </div>
          </template>

          <!-- 显示模式 -->
          <template v-else>
            <div class="icon-manager-preview">
              <img :src="getIconSrc(icon)" :alt="icon.label" />
            </div>
            <span class="icon-manager-label" :title="icon.label">{{ icon.label }}</span>
            <div class="icon-manager-meta">
              <span class="icon-manager-category">{{ icon.category }}</span>
              <span v-if="usedCountOf(icon) > 0" class="icon-used-count">使用中 {{ usedCountOf(icon) }}</span>
              <span v-if="isCustom(icon)" class="icon-manager-size">
                {{ Math.round(('dataUrl' in icon ? (icon as { dataUrl: string }).dataUrl.length : 0) * 0.75 / 1024) }}KB
              </span>
            </div>
            <div v-if="isCustom(icon)" class="icon-manager-actions">
              <button class="btn-icon" @click="startEdit(icon)" title="编辑"><Icon name="pencil" /></button>
              <button class="btn-icon delete" @click="handleDelete(getIconId(icon))" title="删除"><Icon name="trash" /></button>
            </div>
          </template>
        </div>
      </div>

      <div v-if="filteredIcons.length === 0" class="empty-custom">
        {{ searchQuery ? '未找到匹配的图标' : '暂无图标' }}
      </div>
    </BaseDialog>
  </Transition>
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体/底部/移动端适配）已统一到 common/BaseDialog.vue，
   本组件仅保留上传区、筛选、图标网格、导入导出等内容样式 */

/* 上传区域 */
.add-form {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #f1f5f9;
}

.add-form h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 12px 0;
}

.add-form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.hidden-file-input {
  display: none;
}

.btn-add {
  white-space: nowrap;
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.btn-add:hover {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.upload-hint {
  font-size: 12px;
  color: #94a3b8;
}

/* 搜索 + 过滤 */
.filter-bar {
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  padding: 10px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 分类选项卡 */
.category-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.category-tab {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.category-tab:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.category-tab.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

/* 图标网格 */
.icon-manager-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.icon-manager-item {
  position: relative; /* 供「使用中」角标绝对定位 */
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  transition: all 0.2s;
}

/* ===== 「正在使用」标识 ===== */
/* 被站点引用的图标：淡化「内置未用」的灰感，改为正常不透明 + 主色描边，一眼看出在用 */
.icon-manager-item.is-used {
  opacity: 1;
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
}
.icon-used-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 16px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary, #3b82f6);
  white-space: nowrap;
  pointer-events: none; /* 不影响点击编辑/删除 */
}
.icon-used-count {
  font-size: 11px;
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.icon-manager-item.custom {
  background: white;
}

.icon-manager-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.icon-manager-item.built-in {
  opacity: 0.6;
}

.icon-manager-preview {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
}

.icon-manager-preview img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.icon-manager-label {
  font-size: 12px;
  color: #1e293b;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.icon-manager-meta {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 4px;
}

.icon-manager-category {
  font-size: 10px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 10px;
}

.icon-manager-size {
  font-size: 10px;
  color: #94a3b8;
}

.icon-manager-actions {
  display: flex;
  gap: 2px;
  margin-top: 6px;
}

/* 编辑输入 */
.edit-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
  margin-bottom: 4px;
}

.edit-input:focus {
  border-color: #3b82f6;
  outline: none;
}

/* 按钮 */
.btn-icon {
  padding: 4px 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

.btn-icon.delete:hover {
  color: #ef4444;
}

.btn-secondary {
  white-space: nowrap;
  /* 视觉已统一到全局 .ui-btn（style.css） */
}

.btn-secondary:hover {
  /* 视觉已统一到全局 .ui-btn（style.css） */
}

/* 导入导出 */
.import-export-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 20px;
  border-top: 1px solid #f1f5f9;
}

.import-export-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-left: auto;
}

/* 空状态 */
.empty-custom {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 40px 20px;
}
</style>
