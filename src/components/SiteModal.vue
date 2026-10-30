<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import CategoryManager from './CategoryManager.vue'
import { ref, watch, computed } from 'vue'
import type { Site } from '../types'
import { useUrlMetadata } from '../composables/useUrlMetadata'
import { useCategoriesStore } from '../stores/categories'
import { useSitesStore } from '../stores/sites'
import { findPresetIconByUrl, getIconPath } from '../composables/presetIcons'
import { getIconUrl } from '../composables/useIconCache'
import { isImageIcon } from '../composables/categoryIcon'
import type { MergedIcon } from '@/stores/icons'

const categoriesStore = useCategoriesStore()
const sitesStore = useSitesStore()

const props = withDefaults(defineProps<{
  site: Site | null
  /** embedded = true：作为常驻面板内嵌在设置页（无遮罩、无自带标题栏、不响应遮罩点击关闭） */
  embedded?: boolean
}>(), { embedded: false })

const emit = defineEmits<{
  save: [site: Site]
  close: []
}>()

/** 面板尺寸：沿用「设置 → 弹窗尺寸」写入的 CSS 变量（site），未配置时回退默认值 */
const PANEL_WIDTH = 'var(--dlg-w-site, 864px)'
const PANEL_MAX_HEIGHT = 'var(--dlg-h-site, 90vh)'

const form = ref({
  name: '',
  url: '',
  description: '',
  category: 'other',
  tags: '',
  icon: '',
  sort: 0
})

const isEditing = computed(() => !!props.site)
const errors = ref<Record<string, string>>({})
const isLoading = ref(false)

// ===== 图标选择器状态 =====
// 「选择图标」改为弹出独立的图标选择弹框（IconPickerDialog）：选中即回填到表单并关闭，
// 取消 / 点遮罩 / ESC 关闭都不修改原值。图标库（预置 + 自定义）的搜索、分类筛选以及
// 「导入图标 / 上传图标」都在弹框内完成，表单侧只负责回填结果。
const iconPickerOpen = ref(false)

function openIconPicker(): void {
  iconPickerOpen.value = true
}

function closeIconPicker(): void {
  iconPickerOpen.value = false
}

// ===== 分类管理（新增/编辑分类，复用独立的分类管理弹框）=====
const categoryManagerOpen = ref(false)
function openCategoryManager(): void {
  categoryManagerOpen.value = true
}
function closeCategoryManager(): void {
  categoryManagerOpen.value = false
}
/** 在分类管理弹框里新增了分类：自动选中该分类并关闭弹框 */
function onCategoryAdded(id: string): void {
  form.value.category = id
  closeCategoryManager()
}

/** 弹框选中图标：立即回填并关闭弹框；回传空串 = 恢复默认（清空图标字段） */
function onPickIcon(src: string): void {
  form.value.icon = src
  errors.value.icon = ''
  closeIconPicker()
}

// 获取图标的显示 URL（优先 form.icon，其次自动检测 URL）
const iconDisplaySrc = computed(() => {
  if (form.value.icon) return form.value.icon
  if (form.value.url) {
    try {
      new URL(form.value.url)
      return getIconUrl(form.value.url)
    } catch {
      return ''
    }
  }
  return ''
})


// 选择预置图标（推荐位点击沿用同一逻辑）
function selectPresetIcon(icon: MergedIcon) {
  if ('isCustom' in icon) {
    form.value.icon = icon.dataUrl
  } else {
    form.value.icon = `/icons/${icon.name}.${icon.ext}`
  }
  errors.value.icon = ''
}

// 清除图标
function clearIcon() {
  form.value.icon = ''
  errors.value.icon = ''
}

// 获取图标的显示文本（隐藏长 data URL）
const iconDisplayText = computed(() => {
  if (!form.value.icon) return ''
  // 如果是 data URL，显示简短提示
  if (form.value.icon.startsWith('data:')) {
    return '自定义图标 (base64)'
  }
  // 如果是预置图标路径，显示文件名
  if (form.value.icon.startsWith('/icons/')) {
    return form.value.icon.split('/').pop() || form.value.icon
  }
  // 其他 URL 显示原始值（可能较长，但不是 data URL）
  return form.value.icon
})

// 根据 URL 自动推荐预置图标
const suggestedPresetIcon = computed(() => {
  if (!form.value.url) return null
  return findPresetIconByUrl(form.value.url)
})

// 标签自动补全
const tagInputRef = ref<HTMLInputElement | null>(null)
const tagQuery = ref('')
const showTagSuggestions = ref(false)

const { fetchMetadata } = useUrlMetadata()

// 过滤匹配的标签
const matchedTags = computed(() => {
  if (!tagQuery.value) return []
  const query = tagQuery.value.toLowerCase()
  // 获取已填写的标签
  const existingTags = form.value.tags.split(',').map(t => t.trim()).filter(Boolean)
  return sitesStore.allTags.filter(tag => 
    tag.toLowerCase().includes(query) && 
    !existingTags.includes(tag)
  ).slice(0, 8) // 最多显示8个
})

// 输入标签时更新查询
function handleTagInput(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value
  form.value.tags = value
  
  // 获取最后一个逗号后的的内容作为查询
  const lastCommaIndex = value.lastIndexOf(',')
  tagQuery.value = lastCommaIndex >= 0 ? value.slice(lastCommaIndex + 1).trim() : value.trim()
  
  showTagSuggestions.value = tagQuery.value.length > 0 && matchedTags.value.length > 0
}

// 选择标签
function selectTag(tag: string) {
  const currentTags = form.value.tags
  const lastCommaIndex = currentTags.lastIndexOf(',')
  
  if (lastCommaIndex >= 0) {
    // 替换当前输入的部分
    form.value.tags = currentTags.slice(0, lastCommaIndex + 1) + tag + ', '
  } else {
    // 直接替换
    form.value.tags = tag + ', '
  }
  
  tagQuery.value = ''
  showTagSuggestions.value = false
  tagInputRef.value?.focus()
}

// 隐藏建议列表
function hideTagSuggestions() {
  setTimeout(() => {
    showTagSuggestions.value = false
  }, 150)
}

// 自动获取元数据
const handleFetchMetadata = async () => {
  if (!form.value.url.trim()) {
    errors.value.url = '请先输入网址'
    return
  }

  try {
    new URL(form.value.url)
  } catch {
    errors.value.url = '请输入有效的网址'
    return
  }

  // 本地路径不需要获取元数据
  if (form.value.url.startsWith('/')) {
    errors.value.url = '本地路径无需获取元数据'
    return
  }

  // 重复检测（新增模式才检测，编辑模式跳过）
  const duplicate = !isEditing.value ? sitesStore.sites.find(s => s.url === form.value.url) : null

  isLoading.value = true
  if (!duplicate) {
    errors.value.url = ''
  } else {
    errors.value.url = `该网址已存在（${duplicate.name}），继续获取将覆盖现有条目`
  }

  // 优先尝试匹配预置图标（不调用外部 API）
  const presetIcon = findPresetIconByUrl(form.value.url)
  if (presetIcon) {
    const iconPath = getIconPath(presetIcon)
    // 填充图标
    if (!form.value.icon) {
      form.value.icon = iconPath
    }
    // 填充标题（如果用户已手动选择图标，也填充标题）
    const metadata = await fetchMetadata(form.value.url)
    if (metadata) {
      if (!form.value.name && metadata.title) {
        form.value.name = metadata.title
      }
      if (!form.value.description && metadata.description) {
        form.value.description = metadata.description
      }
    }
    isLoading.value = false
    return
  }

  // 没有匹配的预置图标，提示用户手动选择
  errors.value.icon = '未找到匹配的预置图标，可在图标管理中上传自定义图标'
  // 仍然获取标题和描述
  const metadata = await fetchMetadata(form.value.url)
  if (metadata) {
    if (!form.value.name && metadata.title) {
      form.value.name = metadata.title
    }
    if (!form.value.description && metadata.description) {
      form.value.description = metadata.description
    }
  } else if (!form.value.name) {
    errors.value.url = '无法获取网址信息，请手动填写'
  }

  isLoading.value = false
}

watch(() => props.site, (newSite) => {
  if (newSite) {
    form.value = {
      name: newSite.name,
      url: newSite.url,
      description: newSite.description || '',
      category: newSite.category || 'other',
      tags: newSite.tags.join(', '),
      icon: newSite.icon || '',
      sort: newSite.sort || 1
    }
  } else {
    // 新增时默认 sort=1，点击后自动增加
    form.value = {
      name: '',
      url: '',
      description: '',
      category: 'other',
      tags: '',
      icon: '',
      sort: 1
    }
  }
}, { immediate: true })

// 检查是否为有效的 URL（只放行 http/https 与站内路径）
// 不能只靠 `new URL()` 判真：它同样接受 javascript: / data: / ftp: 等协议，
// 保存后由 SiteCard / GlobalSearch 的 window.open 执行 —— 等于给站点列表留了一个脚本执行入口。
const isValidUrl = (url: string): boolean => {
  const v = url.trim()
  if (!v) return false
  // 站内路径（/games/…、/toolbox 等）
  if (v.startsWith('/')) return true
  try {
    const parsed = new URL(v)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const validate = () => {
  errors.value = {}

  if (!form.value.name.trim()) {
    errors.value.name = '请输入网站名称'
  }

  if (!form.value.url.trim()) {
    errors.value.url = '请输入网站地址'
  } else if (!isValidUrl(form.value.url)) {
    errors.value.url = '请输入有效的网址'
  }

  return Object.keys(errors.value).length === 0
}

const handleSubmit = () => {
  if (!validate()) return

  const site: Site = {
    name: form.value.name.trim(),
    url: form.value.url.trim(),
    description: form.value.description.trim() || undefined,
    category: form.value.category,
    tags: form.value.tags.split(',').map(t => t.trim()).filter(Boolean),
    icon: form.value.icon.trim() || undefined,
    sort: form.value.sort || undefined
  }

  emit('save', site)
}
</script>

<template>
  <Transition name="modal">
    <BaseDialog
      class="site-modal-panel"
      :title="isEditing ? '编辑网站' : '添加网站'"
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      :embedded="embedded"
      :hide-header="embedded"
      :close-on-overlay="!embedded"
      @close="emit('close')"
    >
      <form class="site-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>网站名称 *</label>
          <div v-if="isLoading && !form.name" class="skeleton skeleton-name"></div>
          <el-input
            v-else
            v-model="form.name"
            placeholder="例如：GitHub"
            :class="{ 'is-error': errors.name }"
          />
          <span v-if="errors.name" class="error-msg">{{ errors.name }}</span>
        </div>

        <div class="form-group">
          <label>网站地址 *</label>
          <div class="url-input-group">
            <el-input
              v-model="form.url"
              placeholder="例如：https://github.com 或 /games/tetris.html"
              :class="{ 'is-error': errors.url }"
            />
            <button
              type="button"
              class="btn-fetch"
              :disabled="isLoading"
              @click="handleFetchMetadata"
            >
              <span v-if="isLoading" class="spinner"></span>
              {{ isLoading ? '查询中...' : '查询' }}
            </button>
          </div>
          <span v-if="errors.url" class="error-msg">{{ errors.url }}</span>
        </div>

        <div class="form-group">
          <label>网站描述</label>
          <div v-if="isLoading && !form.description" class="skeleton skeleton-desc"></div>
          <el-input
            v-else
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="简要描述这个网站..."
          />
        </div>

        <div class="form-group">
          <label>分类 *</label>
          <el-select v-model="form.category" class="category-select" placeholder="选择分类">
            <el-option
              v-for="cat in categoriesStore.allCategories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            >
              <!-- 保持既有显示规则：图片类图标（图标管理选择）仅展示分组名，
                   旧版 emoji 图标（🎬/📁 等）原样显示。
                   注：el-option 支持自定义插槽，若后续希望图片类图标也显示缩略图，
                   可在此加 <img>（原生 <option> 受限无法渲染图片，故此前只能用文字兜底）。 -->
              <template v-if="!isImageIcon(cat.icon)">{{ cat.icon }} </template>{{ cat.name }}
            </el-option>
          </el-select>
          <button type="button" class="btn-add-category" @click="openCategoryManager">
            <Icon name="plus" /> 新增分类
          </button>
        </div>

        <div class="form-group tag-group">
          <label>标签</label>
          <div class="tag-input-wrapper">
            <input
              ref="tagInputRef"
              :value="form.tags"
              type="text"
              class="ui-input"
              placeholder="输入标签，已有的标签会提示"
              @input="handleTagInput"
              @blur="hideTagSuggestions"
              @focus="tagQuery && (showTagSuggestions = matchedTags.length > 0)"
            />
            <div v-if="showTagSuggestions && matchedTags.length > 0" class="tag-suggestions">
              <span
                v-for="tag in matchedTags"
                :key="tag"
                class="tag-suggestion"
                @mousedown.prevent="selectTag(tag)"
              >
                {{ tag }}
              </span>
            </div>
          </div>
          <span class="form-hint">用逗号分隔，如：开发, 代码, 开源</span>
        </div>

        <div class="form-group icon-group">
          <label>网站图标</label>

          <!-- 图标预览 + 操作按钮 -->
          <div class="icon-picker">
            <!-- 预览 -->
            <div class="icon-preview-wrapper">
              <img
                v-if="iconDisplaySrc"
                :src="iconDisplaySrc"
                class="icon-preview"
                alt="图标预览"
                @error="e => (e.target as HTMLImageElement).src = '/default-icon.svg'"
              />
              <div v-else class="icon-preview icon-preview-empty">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              </div>
              <div v-if="form.icon" class="icon-path" :title="form.icon">{{ iconDisplayText }}</div>
            </div>

            <!-- 操作按钮 -->
            <div class="icon-actions">
              <!-- 自动获取按钮已隐藏 -->
              <!-- <button type="button" class="btn-icon-action" @click="handleAutoFetchIcon" :disabled="isLoading" title="从网址获取">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.86 6.69 2.3"/><path d="M21 3v6h-6"/></svg>
                自动获取
              </button> -->
              <button
                type="button"
                class="btn-icon-action"
                data-testid="site-icon-picker-btn"
                title="从图标库选择图标"
                @click="openIconPicker"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                选择图标
              </button>
              <button v-if="form.icon" type="button" class="btn-icon-action btn-icon-clear" @click="clearIcon" title="清除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- 预置图标推荐 -->
            <div v-if="suggestedPresetIcon && !form.icon" class="icon-suggestion">
              <span>检测到：</span>
              <button type="button" class="btn-suggestion" @click="selectPresetIcon(suggestedPresetIcon)">
                <img :src="getIconPath(suggestedPresetIcon)" class="suggestion-icon" alt="" />
                {{ suggestedPresetIcon.label }}
              </button>
            </div>
          </div>

          <span v-if="errors.icon" class="error-msg">{{ errors.icon }}</span>

          <span v-if="!form.icon" class="form-hint">可选，点击「选择图标」从图标库挑选</span>
        </div>

        <!-- 排序权重 - 已改为点击频率自动排序，此处隐藏 -->
        <!-- 
        <div class="form-group">
          <label>排序权重</label>
          <input
            v-model.number="form.sort"
            type="number"
            placeholder="数字越小越靠前"
          />
          <span class="form-hint">前台不显示此字段，仅用于排序</span>
        </div>
        -->

        <!-- 表单操作区：保持在 <form> 内（提交按钮依赖 form 归属），故不用基类 #footer 插槽 -->
      <div class="site-form-actions">
        <button v-if="!embedded" type="button" class="btn-cancel" @click="emit('close')">取消</button>
        <button type="submit" class="btn-submit">
          {{ isEditing ? '保存' : '添加' }}
        </button>
      </div>
      </form>
    </BaseDialog>
  </Transition>

  <!-- 图标选择弹框：选中即回填并关闭；取消 / 遮罩点击 / ESC 关闭均不修改原值。
       必须放在 <form> 之外：弹框内搜索框按回车会触发隐式表单提交，导致误提交新增网址 -->
  <IconPickerDialog
    v-if="iconPickerOpen"
    title="选择网站图标"
    :current="form.icon"
    @select="onPickIcon"
    @close="closeIconPicker"
  />

  <!-- 分类管理弹框：新增/编辑分类，复用独立分类管理页面（自带遮罩与关闭） -->
  <CategoryManager
    v-if="categoryManagerOpen"
    @close="closeCategoryManager"
    @added="onCategoryAdded"
  />
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体）与 embedded 内嵌模式布局
   已统一到 common/BaseDialog.vue（embedded + hide-header + close-on-overlay=false），
   本组件仅保留表单、标签建议、图标选择器、动效等内容样式 */

/* 骨架屏动画 */
@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border, #e2e8f0);
}

.skeleton-name {
  height: 18px;
  width: 60%;
  margin-bottom: 8px;
}

.skeleton-desc {
  height: 60px;
  width: 100%;
}

.skeleton-icon {
  height: 40px;
  width: 40px;
  flex-shrink: 0;
}

/* 按钮 spinner */
.btn-fetch .spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 尺寸契约由基类的 :width / :max-height 承接（--dlg-w-site / --dlg-h-site）；
   此处仅补一处动态视口单位升级：原 .modal 声明过 90dvh 兜底 */
@supports (max-height: 90dvh) {
  .site-modal-panel :deep(.bd-panel) {
    max-height: var(--dlg-h-site, 90dvh);
  }
}

.form-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin-bottom: 20px;
}

.form-group label {
  flex-shrink: 0;
  width: 84px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

/* 网站图标字段：标签相对 48px 预览图垂直居中，而非整个图标列 */
.form-group.icon-group label {
  align-self: flex-start;
  margin-top: 13px; /* (48px 预览图 - 22px 标签行高) / 2 */
}

/* 输入控件占满标签右侧剩余宽度 */
.form-group > input,
.form-group > textarea,
.form-group > select,
.form-group > .el-input,
.form-group > .el-select,
.form-group > .el-textarea,
.form-group > .url-input-group,
.form-group > .tag-input-wrapper,
.form-group > .icon-picker,
.form-group > .skeleton {
  flex: 1;
  min-width: 0;
}

/* `<el-input type="textarea">` 的根类名是 .el-textarea、`<el-select>` 是 .el-select，
   二者在 EP 里均非 width:100%（el-textarea 不撑满、el-select 是 inline-block），
   故显式给宽度，保证与单行输入框左右对齐 */
.form-group .el-textarea,
.form-group .el-select {
  width: 100%;
}

/* 提示与错误信息整行显示在控件下方，与输入框左对齐 */
.form-group > .form-hint,
.form-group > .error-msg {
  flex-basis: 100%;
  margin-left: 96px; /* 84px 标签宽 + 12px 间距 */
}

/* 输入控件视觉已统一：文本/描述/分类改用 el-input / el-select（自带边框、聚焦环、
   暗色与校验态），标签输入因需自定义下拉 + ref + @input/@blur/@focus 保留原生 input，
   并挂全局 .ui-input。故不再按元素名（input/textarea/select）设视觉，
   否则会与 el-* 内部结构失配。 */

/* el-input 校验错误态：EP 依 .is-error 给红色内嵌框；此处补一层 token 化兜底 */
.form-group .el-input.is-error :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--color-error, #ef4444) inset;
}

.category-select {
  cursor: pointer;
}

.url-input-group {
  display: flex;
  gap: 8px;
}

.url-input-group .el-input {
  flex: 1;
}

/* .btn-fetch 视觉已统一到全局 .ui-btn--success */

/* 标签输入组 */
.tag-group {
  position: relative;
}

.tag-input-wrapper {
  position: relative;
}

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
  padding: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.tag-suggestion {
  padding: 4px 10px;
  background: var(--color-bg-hover, #f1f5f9);
  border-radius: 4px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-suggestion:hover {
  background: var(--color-primary, #3b82f6);
  color: white;
}

/* 校验错误态：文本/描述/分类走 el-input.is-error（见上方 :deep 兜底规则），
   原按 .error 类给 input/textarea 加红框的规则已随之移除。 */
.error-msg {
  display: block;
  font-size: 12px;
  color: var(--color-error, #ef4444);
  margin-top: 4px;
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  margin-top: 4px;
}

/* 表单操作区（位于 form 内，非弹框底部条） */
.site-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}

/* .btn-cancel 视觉已统一到全局 .ui-btn（次按钮） */

/* .btn-submit 视觉已统一到全局 .ui-btn--primary */

/* === Vue Transition 动画 === */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active :deep(.bd-panel) {
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active :deep(.bd-panel) {
  animation: modal-out 0.2s ease forwards;
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modal-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
}

/* ========================================
   图标选择器
   ======================================== */

.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.icon-preview-wrapper {
  display: flex;
  align-items: center;
}

.icon-preview {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-hover, #f1f5f9);
}

.icon-path {
  margin-left: 8px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  word-break: break-all;
}

.icon-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #94a3b8);
}

.icon-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 图标区的小动作按钮（获取图标/清除）：与全局 .ui-btn--sm 同规格（30px / 8px 圆角 / 12px 字） */
.btn-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1, 4px);
  min-height: 30px;
  padding: 0 var(--space-3, 12px);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition:
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
  white-space: nowrap;
}

.btn-icon-action:hover:not(:disabled) {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
}

.btn-icon-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon-clear {
  padding: 6px 8px;
  color: var(--color-text-muted, #94a3b8);
  border-color: transparent;
}

.btn-icon-clear:hover {
  color: var(--color-error, #ef4444);
  border-color: transparent;
  background: #fef2f2;
}

.icon-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.btn-suggestion {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: 6px;
  background: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-suggestion:hover {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.suggestion-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}
.icon-grid-item.active .grid-icon-label {
  color: var(--color-primary, #3b82f6);
}

/* 分类下拉后的「新增分类」按钮：与下拉同行右置，紧凑不抢视觉 */
/* .btn-add-category 视觉已统一到全局 .ui-btn--primary */

@keyframes dropdownIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
