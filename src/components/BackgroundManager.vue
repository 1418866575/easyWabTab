<script setup lang="ts">
import Icon from './Icon.vue'
import { toastAlert } from '@/utils/dialog'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useThemeStore, type BackgroundType, type CustomBackground } from '../stores/theme'

/** embedded = true：作为常驻面板内嵌在设置页（无遮罩、无自带标题栏、不响应 ESC 与遮罩点击关闭） */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const emit = defineEmits<{
  close: []
}>()

const themeStore = useThemeStore()

/** 遮罩点击关闭：仅弹框模式生效（内嵌面板点击空白不应关闭） */
function onOverlayClick(): void {
  if (!props.embedded) emit('close')
}

// ESC 键关闭弹框（内嵌模式下交给外层容器处理，避免把整个设置页一起关掉）
function handleKeydown(event: KeyboardEvent) {
  if (props.embedded) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  // 断开缩略图观察器，避免弹框关闭后监听常驻
  thumbObserver?.disconnect()
  thumbObserver = null
})

// 当前选中的类型
const selectedType = ref<BackgroundType>(themeStore.backgroundType)
const selectedValue = ref<string>(themeStore.backgroundValue)

// 颜色选择
const solidColor = ref(themeStore.backgroundType === 'solid' ? themeStore.backgroundValue : '#667eea')

// 渐变选择
const gradientPresets = [
  { id: 'g1', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', name: '紫色渐变' },
  { id: 'g2', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', name: '粉色渐变' },
  { id: 'g3', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', name: '蓝色渐变' },
  { id: 'g4', value: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', name: '绿色渐变' },
  { id: 'g5', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', name: '日落渐变' },
  { id: 'g6', value: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', name: '柔和渐变' },
  { id: 'g7', value: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', name: '樱花渐变' },
  { id: 'g8', value: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', name: '暖阳渐变' },
]

const selectedGradient = ref(
  themeStore.backgroundType === 'gradient' 
    ? gradientPresets.find(g => g.value === themeStore.backgroundValue)?.id || 'g1'
    : 'g1'
)

// 图片选择
const imageUrlInput = ref('')
const showImageInput = ref(false)

// 内容区域透明度（仅图片背景显示滑块，实时生效）
const contentOpacity = ref(themeStore.backgroundOpacity)
const opacityPercent = computed(() => Math.round(contentOpacity.value * 100))

function updateContentOpacity() {
  themeStore.setBackgroundOpacity(contentOpacity.value)
}

// 自定义图片列表
const customImages = ref<CustomBackground[]>([])

// 上传背景图片
const fileInput = ref<HTMLInputElement | null>(null)
const MAX_BG_SIZE = 5 * 1024 * 1024 // 5MB for backgrounds

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > MAX_BG_SIZE) {
    toastAlert('背景图片文件不能超过 5MB')
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    const name = prompt('请输入背景名称', file.name.replace(/\.[^.]+$/, ''))
    if (!name || !name.trim()) {
      input.value = ''
      return
    }

    const newImg: CustomBackground = {
      id: `custom-${Date.now()}`,
      type: 'image',
      value: dataUrl,
      name: name.trim()
    }
    customImages.value.push(newImg)
    themeStore.addCustomBackground(newImg)
    selectedValue.value = newImg.value
    input.value = ''
  }
  reader.readAsDataURL(file)
}

// 自定义渐变
const showGradientCreator = ref(false)
const customGradientStart = ref('#667eea')
const customGradientEnd = ref('#764ba2')
const customGradientAngle = ref(135)

// 生成渐变值
function generateGradientValue(): string {
  return `linear-gradient(${customGradientAngle.value}deg, ${customGradientStart.value} 0%, ${customGradientEnd.value} 100%)`
}

// 预览自定义渐变
const customGradientPreview = computed(() => {
  return { background: generateGradientValue() }
})

// 保存自定义渐变（直接修改第一个渐变）
function saveCustomGradient() {
  // 直接修改第一个渐变预设
  gradientPresets[0].value = generateGradientValue()
  gradientPresets[0].name = '自定义渐变'
  selectedGradient.value = 'g1'
  selectedValue.value = generateGradientValue()
  showGradientCreator.value = false
}

// 预览样式
const previewStyle = computed(() => {
  if (selectedType.value === 'none') {
    return {}
  } else if (selectedType.value === 'solid') {
    return { background: solidColor.value }
  } else if (selectedType.value === 'gradient') {
    const gradient = gradientPresets.find(g => g.id === selectedGradient.value)
    return { background: gradient?.value || '' }
  } else if (selectedType.value === 'image') {
    const customImg = customImages.value.find(img => img.value === selectedValue.value)
    if (customImg) {
      return { backgroundImage: `url(${customImg.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    }
    const preset = themeStore.presetBackgrounds.find(p => p.value === selectedValue.value)
    if (preset) {
      return { backgroundImage: `url(${preset.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    }
    return { backgroundImage: `url(${selectedValue.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return {}
})

// 选择背景类型
function selectType(type: BackgroundType) {
  selectedType.value = type
  if (type === 'none') {
    selectedValue.value = ''
  } else if (type === 'solid') {
    selectedValue.value = solidColor.value
  } else if (type === 'gradient') {
    const gradient = gradientPresets.find(g => g.id === selectedGradient.value)
    selectedValue.value = gradient?.value || ''
  }
}

// 选择渐变
function selectGradient(id: string) {
  selectedGradient.value = id
  const gradient = gradientPresets.find(g => g.id === id)
  if (gradient) {
    selectedValue.value = gradient.value
  }
}

// 选择预设图片
function selectPresetImage(img: CustomBackground) {
  selectedValue.value = img.value
}

// 获取缩略图 URL（现在使用本地路径）
// ===== 背景缩略图懒加载 =====
// 30 张预设背景合计约 7.5MB；原先打开弹框即通过 CSS background-image 全量拉取原图，
// 移动端首次打开要一次性下载数 MB。改为格子进入视口（含 200px 预取）后才真正加载，
// DOM 结构与视觉表现保持不变。
const canObserve = typeof IntersectionObserver !== 'undefined'
const loadedThumbs = ref<Set<string>>(new Set())
let thumbObserver: IntersectionObserver | null = null

function ensureThumbObserver(): IntersectionObserver | null {
  if (!canObserve) return null
  if (thumbObserver) return thumbObserver
  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const id = (entry.target as HTMLElement).dataset.thumbId
        if (!id) continue
        const next = new Set(loadedThumbs.value)
        next.add(id)
        loadedThumbs.value = next
        thumbObserver?.unobserve(entry.target)
      }
    },
    { rootMargin: '200px' }
  )
  return thumbObserver
}

function bindThumb(id: string, el: unknown): void {
  if (!canObserve || !(el instanceof HTMLElement)) return
  el.dataset.thumbId = id
  ensureThumbObserver()?.observe(el)
}

// 不支持 IntersectionObserver 时回退为原行为（直接加载原图）
function getThumbnailUrl(img: CustomBackground): string {
  if (!canObserve) return img.value
  return loadedThumbs.value.has(img.id) ? img.value : ''
}

// 添加自定义图片
function addCustomImage() {
  if (!imageUrlInput.value.trim()) return
  
  const newImg: CustomBackground = {
    id: `custom-${Date.now()}`,
    type: 'image',
    value: imageUrlInput.value.trim(),
    name: `自定义背景 ${customImages.value.length + 1}`
  }
  customImages.value.push(newImg)
  themeStore.addCustomBackground(newImg)
  selectedValue.value = newImg.value
  imageUrlInput.value = ''
  showImageInput.value = false
}

// 选择自定义图片
function selectCustomImage(img: CustomBackground) {
  selectedValue.value = img.value
}

// 删除自定义图片
function deleteCustomImage(id: string) {
  customImages.value = customImages.value.filter(img => img.id !== id)
  themeStore.removeCustomBackground(id)
  if (selectedValue.value === themeStore.customBackgrounds.find(c => c.id === id)?.value) {
    selectedValue.value = ''
  }
}

// 确认应用
function applyBackground() {
  themeStore.setBackground(selectedType.value, selectedValue.value)
  emit('close')
}

// 清除背景
function clearBackground() {
  selectedType.value = 'none'
  selectedValue.value = ''
  themeStore.clearBackground()
}
</script>

<template>
  <div :class="embedded ? 'mgr-embed' : 'modal-overlay'" @click.self="onOverlayClick">
    <div class="background-manager">
      <div v-if="!embedded" class="modal-header">
        <h2><Icon name="palette" /> 背景管理</h2>
        <button class="close-btn" @click="emit('close')" title="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- 预览区域 -->
        <div class="preview-section">
          <div class="background-preview" :class="selectedType" :style="previewStyle">
            <span v-if="selectedType === 'none'" class="preview-text">预览区域</span>
          </div>
        </div>

        <!-- 背景类型选择 -->
        <div class="type-section">
          <h3 class="section-title">背景类型</h3>
          <div class="type-buttons">
            <button 
              class="type-btn" 
              :class="{ active: selectedType === 'none' }"
              @click="selectType('none')"
            >
              <Icon name="cancel" /> 无
            </button>
            <button 
              class="type-btn" 
              :class="{ active: selectedType === 'solid' }"
              @click="selectType('solid')"
            >
              <Icon name="palette" /> 纯色
            </button>
            <button 
              class="type-btn" 
              :class="{ active: selectedType === 'gradient' }"
              @click="selectType('gradient')"
            >
              <Icon name="gradient" /> 渐变
            </button>
            <button 
              class="type-btn" 
              :class="{ active: selectedType === 'image' }"
              @click="selectType('image')"
            >
              <Icon name="image" /> 图片
            </button>
          </div>
        </div>

        <!-- 纯色选择 -->
        <div v-if="selectedType === 'solid'" class="color-section">
          <h3 class="section-title">选择颜色</h3>
          <div class="color-picker">
            <input type="color" v-model="solidColor" @change="selectedValue = solidColor" />
            <input type="text" v-model="solidColor" class="color-input" placeholder="#667eea" />
          </div>
        </div>

        <!-- 渐变选择 -->
        <div v-if="selectedType === 'gradient'" class="gradient-section">
          <h3 class="section-title">选择渐变</h3>
          <div class="background-grid">
            <div
              v-for="gradient in gradientPresets"
              :key="gradient.id"
              class="background-option"
              :class="{ active: selectedGradient === gradient.id }"
              :style="{ background: gradient.value }"
              :title="gradient.name"
              @click="selectGradient(gradient.id)"
            ></div>
          </div>

          <!-- 自定义渐变创建器 -->
          <div class="custom-gradient-section">
            <button v-if="!showGradientCreator" class="add-gradient-btn" @click="showGradientCreator = true">
              <Icon name="pencil" /> 修改渐变
            </button>
            
            <div v-else class="gradient-creator">
              <h4 class="subsection-title">自定义渐变</h4>
              <div class="gradient-creator-row">
                <div class="color-picker-group">
                  <label>起始颜色</label>
                  <input type="color" v-model="customGradientStart" />
                </div>
                <div class="color-picker-group">
                  <label>结束颜色</label>
                  <input type="color" v-model="customGradientEnd" />
                </div>
                <div class="angle-picker-group">
                  <label>角度: {{ customGradientAngle }}°</label>
                  <input type="range" v-model.number="customGradientAngle" min="0" max="360" step="1" />
                </div>
              </div>
              <div class="gradient-preview-box" :style="customGradientPreview"></div>
              <div class="gradient-creator-actions">
                <button class="confirm-btn" @click="saveCustomGradient">应用到第一个渐变</button>
                <button class="cancel-btn" @click="showGradientCreator = false">取消</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 图片选择 -->
        <div v-if="selectedType === 'image'" class="image-section">
          <h3 class="section-title">选择图片</h3>
          
          <!-- 上传本地图片 -->
          <div class="upload-section">
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden-file-input"
              @change="handleUpload"
            />
            <button class="upload-btn" @click="fileInput?.click()">
              <Icon name="folder" /> 上传本地图片
            </button>
            <span class="upload-hint">支持 JPG/PNG/GIF/WebP，最大 5MB</span>
          </div>

          <!-- 内容区域透明度 -->
          <div class="opacity-section">
            <div class="opacity-header">
              <label class="subsection-title" for="content-opacity">内容区域透明度</label>
              <span class="opacity-value">{{ opacityPercent }}%</span>
            </div>
            <input
              id="content-opacity"
              type="range"
              class="opacity-slider"
              v-model.number="contentOpacity"
              min="0.1"
              max="1"
              step="0.05"
              @input="updateContentOpacity"
            />
            <p class="opacity-hint">数值越低，页面内容越透明，背景图片越清晰</p>
          </div>

          <!-- 自定义图片列表 -->
          <div v-if="themeStore.customBackgrounds.length > 0" class="custom-section">
            <h4 class="subsection-title">自定义</h4>
            <div class="background-grid">
              <div
                v-for="img in themeStore.customBackgrounds"
                :key="img.id"
                :ref="(el) => bindThumb(img.id, el)"
                class="background-option custom-background-item"
                :class="{ active: selectedValue === img.value }"
                :style="{ backgroundImage: getThumbnailUrl(img) ? `url(${getThumbnailUrl(img)})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }"
                :title="img.name"
                @click="selectCustomImage(img)"
              >
                <button class="delete-btn" @click.stop="deleteCustomImage(img.id)">×</button>
              </div>
            </div>
          </div>

          <!-- 预设图片 -->
          <div class="preset-section">
            <h4 class="subsection-title">预设风景</h4>
            <div class="background-grid">
              <div
                v-for="img in themeStore.presetBackgrounds.filter(p => p.type === 'image')"
                :key="img.id"
                :ref="(el) => bindThumb(img.id, el)"
                class="background-option"
                :class="{ active: selectedValue === img.value }"
                :style="{ backgroundImage: getThumbnailUrl(img) ? `url(${getThumbnailUrl(img)})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }"
                :title="img.name"
                @click="selectPresetImage(img)"
              ></div>
            </div>
          </div>
          
          <!-- 添加自定义图片 -->
          <div class="add-custom-section">
            <button v-if="!showImageInput" class="add-btn" @click="showImageInput = true">
              + 添加自定义图片
            </button>
            <div v-else class="custom-input">
              <input 
                type="text" 
                v-model="imageUrlInput" 
                placeholder="输入图片 URL..."
                @keyup.enter="addCustomImage"
              />
              <button class="confirm-btn" @click="addCustomImage">添加</button>
              <button class="cancel-btn" @click="showImageInput = false">取消</button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-clear" @click="clearBackground" :disabled="selectedType === 'none'">
          清除背景
        </button>
        <button class="btn-primary" @click="applyBackground">
          应用
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.background-manager {
  background-color: white;
  border-radius: 16px;
  width: 100%;
  max-width: var(--dlg-w-background, 800px);
  max-height: var(--dlg-h-background, 85vh);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

/* close-btn 视觉已统一到全局 .close-btn（style.css） */

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #3b82f6;
}

.subsection-title {
  margin: 16px 0 10px 0;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
}

/* 预览区域 */
.preview-section {
  margin-bottom: 8px;
}

.background-preview {
  width: 100%;
  height: 120px;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  background-color: #f8fafc;
}

.background-preview.none {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

.preview-text {
  color: #94a3b8;
  font-size: 14px;
}

/* 类型选择 */
.type-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.type-btn {
  flex: 1;
  min-width: 80px;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  background: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  color: #64748b;
}

.type-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.type-btn.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #3b82f6;
}

/* 颜色选择 */
.color-picker {
  display: flex;
  gap: 12px;
  align-items: center;
}

.color-picker input[type="color"] {
  width: 60px;
  height: 40px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.color-input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  font-family: monospace;
}

.color-input:focus {
  outline: none;
  border-color: #3b82f6;
}

/* 背景网格 */
.background-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.background-option {
  aspect-ratio: 4/3;
  border-radius: 8px;
  border: 2px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.background-option:hover {
  transform: scale(1.05);
  border-color: #3b82f6;
}

.background-option.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

/* 自定义图片项 */
.custom-background-item {
  position: relative;
}

.custom-background-item .delete-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  border: 2px solid white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.2s;
}

.custom-background-item:hover .delete-btn {
  opacity: 1;
}

/* 添加自定义 */
.add-custom-section {
  margin-bottom: 16px;
}

.add-btn {
  width: 100%;
  /* 视觉已统一到全局 .ui-btn--primary（style.css）；仅保留整宽布局 */
}

.add-btn:hover {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.custom-input {
  display: flex;
  gap: 8px;
}

.custom-input input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
}

.custom-input input:focus {
  outline: none;
  border-color: #3b82f6;
}

/* .confirm-btn 视觉已统一到全局 .ui-btn--primary */

/* .cancel-btn 视觉已统一到全局 .ui-btn（次按钮） */

/* 底部 */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

/* .btn-clear 视觉已统一到全局 .ui-btn--danger */

/* .btn-primary 视觉已统一到全局 .ui-btn--primary */

/* 上传背景图片 */
.hidden-file-input {
  display: none;
}

.upload-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

/* .upload-btn 视觉已统一到全局 .ui-btn--success */

.upload-hint {
  font-size: 12px;
  color: #94a3b8;
}

/* 内容区域透明度 */
.opacity-section {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  margin-bottom: 16px;
}

.opacity-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.opacity-header .subsection-title {
  margin: 0;
}

.opacity-value {
  font-size: 14px;
  font-weight: 600;
  color: #3b82f6;
  min-width: 44px;
  text-align: right;
}

.opacity-slider {
  width: 100%;
  margin-top: 12px;
  accent-color: #3b82f6;
  cursor: pointer;
}

.opacity-hint {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #94a3b8;
}

/* 自定义渐变 */
.custom-gradient-section {
  margin-top: 16px;
}

/* .add-gradient-btn 视觉已统一到全局 .ui-btn--primary；保留整宽布局 */
.add-gradient-btn {
  width: 100%;
}

.gradient-creator {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.gradient-creator-row {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.color-picker-group, .angle-picker-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-picker-group label, .angle-picker-group label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.color-picker-group input[type="color"] {
  width: 50px;
  height: 36px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.angle-picker-group input[type="range"] {
  width: 120px;
  cursor: pointer;
}

.gradient-preview-box {
  width: 100%;
  height: 60px;
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid #e2e8f0;
}

.gradient-creator-actions {
  display: flex;
  gap: 8px;
}

/* 响应式 */
@media (max-width: 500px) {
  .background-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .type-btn {
    min-width: 70px;
    padding: 10px 12px;
    font-size: 13px;
  }
}

/* ============================================================
   embedded 模式：常驻面板内嵌在「设置 → 导航站 → 背景」
   无遮罩 / 无固定定位，宽度撑满父面板，超高由外层面板滚动。
   ============================================================ */
.mgr-embed {
  position: static;
  inset: auto;
  z-index: auto;
  display: block;
  width: 100%;
  padding: 0;
  background-color: transparent;
  overflow: visible;
}

/* 内嵌时取消弹框尺寸约束（原 .background-manager 的 max-width / max-height / 阴影） */
.mgr-embed .background-manager {
  width: 100%;
  max-width: none;
  max-height: none;
  box-shadow: none;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  background-color: var(--color-bg-card, #fff);
}
</style>
