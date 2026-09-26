<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'
import { toastAlert } from '@/utils/dialog'
import { useIconsStore, type MergedIcon, type IconExportData } from '@/stores/icons'

// 图标选择弹框：从「图标管理」的图标库（预置图标 + 自定义图标）中挑选一个图标。
// 与新增网站的图标选择同源（useIconsStore.allIcons），仅交互形态改为弹框。
// 选中后回传图标 src（/icons/<name>.<ext> 或 base64 dataUrl）；「恢复默认」回传空串，由调用方回退内置图标。
// 搜索框上方提供「导入图标 / 上传图标」，与图标管理页同一套校验与提示：导入走 JSON 导出文件、
// 上传走图片文件（类型 + 500KB 大小校验），成功后写入图标库并即时出现在列表中。
const props = withDefaults(
  defineProps<{
    title?: string
    current?: string
  }>(),
  { title: '选择图标', current: '' }
)

const emit = defineEmits<{
  select: [src: string]
  close: []
}>()

const iconsStore = useIconsStore()

// 首次打开前确保图标库已从 IndexedDB 载入（导入/上传要基于已加载的列表去重与合并）
onMounted(() => {
  void iconsStore.ensureLoaded()
})

const keyword = ref('')
const category = ref('all')

/** 分类列表：all（全部）+ 图标库实际出现的分类（有自定义图标时会多出「自定义」） */
const categories = computed<string[]>(() => {
  const cats: string[] = ['all']
  for (const icon of iconsStore.allIcons) {
    if (!cats.includes(icon.category)) cats.push(icon.category)
  }
  return cats
})

const filteredIcons = computed<MergedIcon[]>(() => {
  let list = iconsStore.allIcons
  if (category.value !== 'all') {
    list = list.filter((i) => i.category === category.value)
  }
  const q = keyword.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (i) => i.label.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    )
  }
  return list
})

/** 图标实际 src：自定义图标为 base64 dataUrl，预置图标为 /icons/<name>.<ext> */
function iconSrc(icon: MergedIcon): string {
  if ('isCustom' in icon) return icon.dataUrl
  return `/icons/${icon.name}.${icon.ext}`
}

function categoryLabel(cat: string): string {
  return cat === 'all' ? '全部' : cat
}

function handlePick(icon: MergedIcon): void {
  emit('select', iconSrc(icon))
}

/** 恢复默认：回传空串，调用方据此回退到内置图标 */
function handleReset(): void {
  emit('select', '')
}

// ========================================
// 导入图标 / 上传图标（与图标管理页同一套校验与提示）
// ========================================
const importInput = ref<HTMLInputElement | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)
/** 上传中：禁用按钮避免重复选择同一文件 */
const uploading = ref(false)
const MAX_SIZE = 500 * 1024 // 500KB
const ALLOWED_MIME = /^image\//

/** 导入/上传成功后清空筛选，保证新图标一定出现在可见列表中 */
function resetFilters(): void {
  category.value = 'all'
  keyword.value = ''
}

/** 导入图标：JSON 导出文件（icons 导出格式 version=1 + icons 数组） */
function handleImport(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onerror = () => {
    toastAlert('导入失败：文件读取出错，请重试')
    input.value = ''
  }
  reader.onload = async () => {
    let data: unknown
    try {
      data = JSON.parse(reader.result as string)
    } catch {
      toastAlert('导入失败：文件不是合法的 JSON，请确认文件未损坏或编码正确')
      input.value = ''
      return
    }
    const parsed = data as IconExportData
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !Array.isArray(parsed.icons)) {
      toastAlert('导入失败：文件格式不正确（必须是 icons 导出文件，含 version=1 和 icons 数组）')
      input.value = ''
      return
    }
    try {
      const { added } = await iconsStore.importIcons(parsed)
      resetFilters()
      if (added > 0) {
        toastAlert('导入成功：新增 ' + added + ' 个图标（重复 ID 已自动跳过），可在列表中选择')
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

/** 上传图标：图片文件（类型 + 大小校验），成功后以文件名作为图标名称入库 */
function handleUpload(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (uploading.value) {
    input.value = ''
    return
  }

  // 先取文件名再校验，失败提示里可带上具体文件名
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || '自定义图标'

  if (!ALLOWED_MIME.test(file.type)) {
    toastAlert('上传失败：' + file.name + ' 不是图片文件，请选择 PNG / JPG / SVG / GIF / WebP 图片')
    input.value = ''
    return
  }
  if (file.size > MAX_SIZE) {
    toastAlert('上传失败：图标文件不能超过 500KB（当前 ' + (file.size / 1024).toFixed(0) + 'KB）')
    input.value = ''
    return
  }

  uploading.value = true
  const reader = new FileReader()
  reader.onerror = () => {
    uploading.value = false
    toastAlert('上传失败：文件读取出错，请重试')
    input.value = ''
  }
  reader.onload = async () => {
    const dataUrl = reader.result as string
    try {
      await iconsStore.addIcon({
        name: baseName,
        label: baseName,
        dataUrl,
        category: '其他'
      })
      resetFilters()
      toastAlert('上传成功：已添加「' + baseName + '」，可在列表中选择')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? '')
      if (/Quota|配额|space|exceed/i.test(msg)) {
        toastAlert('上传失败：存储空间不足，请减少自定义图标数量后重试')
      } else {
        toastAlert('上传失败：' + (msg || '未知错误'))
      }
    } finally {
      uploading.value = false
      input.value = ''
    }
  }
  reader.readAsDataURL(file)
}

// ESC 只关本弹框：注册在 document 捕获阶段（早于设置弹窗 window 冒泡监听），
// 命中后阻止继续传播，避免连带关闭外层设置弹窗。
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  void iconsStore.ensureLoaded()
  document.addEventListener('keydown', handleKeydown, true)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <div class="ipd-mask" @click.self="emit('close')">
    <div class="ipd-dialog" role="dialog" aria-modal="true" :aria-label="props.title">
      <div class="ipd-head">
        <h3 class="ipd-title">{{ props.title }}</h3>
        <button type="button" class="ipd-close" aria-label="关闭" @click="emit('close')">×</button>
      </div>

      <div class="ipd-body">
        <!-- 导入 / 上传：导入走 JSON 导出文件，上传走图片文件（≤500KB） -->
        <div class="ipd-actions">
          <input
            ref="importInput"
            type="file"
            accept=".json,application/json"
            class="ipd-file-input"
            data-testid="ipd-import-input"
            @change="handleImport"
          />
          <button
            type="button"
            class="ipd-action-btn"
            data-testid="ipd-import-btn"
            title="从图标管理的导出文件（JSON）批量导入图标"
            @click="importInput?.click()"
          >
            <Icon name="download" /> 导入图标
          </button>
          <input
            ref="uploadInput"
            type="file"
            accept="image/*"
            class="ipd-file-input"
            data-testid="ipd-upload-input"
            @change="handleUpload"
          />
          <button
            type="button"
            class="ipd-action-btn"
            :disabled="uploading"
            data-testid="ipd-upload-btn"
            title="上传本地图片（PNG / JPG / SVG / GIF / WebP，最大 500KB）作为自定义图标"
            @click="uploadInput?.click()"
          >
            <Icon name="upload" /> {{ uploading ? '上传中…' : '上传图标' }}
          </button>
          <span class="ipd-action-hint">自定义 {{ iconsStore.customIcons.length }} 个 · 图片 ≤500KB</span>
        </div>

        <input
          v-model="keyword"
          type="text"
          class="ipd-search"
          placeholder="搜索图标…"
          aria-label="搜索图标"
        />

        <div class="ipd-cats">
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            class="ipd-cat"
            :class="{ active: category === cat }"
            @click="category = cat"
          >
            {{ categoryLabel(cat) }}
          </button>
        </div>

        <div class="ipd-grid">
          <button
            v-for="icon in filteredIcons"
            :key="iconSrc(icon)"
            type="button"
            class="ipd-item"
            :class="{ active: props.current === iconSrc(icon) }"
            :title="icon.label"
            @click="handlePick(icon)"
          >
            <img :src="iconSrc(icon)" :alt="icon.label" class="ipd-item-img" />
            <span class="ipd-item-label">{{ icon.label }}</span>
          </button>
          <p v-if="filteredIcons.length === 0" class="ipd-empty">没有匹配的图标</p>
        </div>
      </div>

      <div class="ipd-foot ewt-dialog-footer">
        <el-button size="small" :disabled="!props.current" @click="handleReset">恢复默认</el-button>
        <el-button size="small" type="primary" @click="emit('close')">取消</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩层级高于设置弹窗（300），保证嵌套在设置弹窗内时显示在最上层 */
.ipd-mask {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}

.ipd-dialog {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(80vh, 640px);
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.ipd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.ipd-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.ipd-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.ipd-close:hover {
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #1e293b);
}

.ipd-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: 12px 16px;
}

/* 导入 / 上传入口：位于搜索框上方，与弹框内其它按钮同一套尺寸与配色 */
.ipd-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

/* 隐藏的 file input：不占布局，由按钮代理点击 */
.ipd-file-input {
  display: none;
}

.ipd-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.ipd-action-btn:hover:not(:disabled) {
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.ipd-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ipd-action-hint {
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
}

.ipd-search {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: var(--color-bg-input, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  color: var(--color-text, #334155);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.ipd-search:focus {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.ipd-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
}

.ipd-cat {
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}

.ipd-cat:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.ipd-cat.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.ipd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  padding: 4px;
}

.ipd-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.ipd-item:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.ipd-item.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-color: var(--color-primary, #3b82f6);
}

.ipd-item-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.ipd-item-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
}

.ipd-item.active .ipd-item-label {
  color: var(--color-primary, #3b82f6);
}

.ipd-empty {
  grid-column: 1 / -1;
  margin: 16px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
}

.ipd-foot {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}

@media (max-width: 768px) {
  .ipd-mask {
    padding: 12px;
  }
  .ipd-dialog {
    max-height: 86vh;
  }
  .ipd-grid {
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  }
  /* 触屏放大触控目标 */
  .ipd-item {
    padding: 10px 4px;
  }
}

/* 暗色：主要靠主题 token 切换，此处仅兜底少数硬编码场景 */
html.dark .ipd-dialog {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}
</style>
