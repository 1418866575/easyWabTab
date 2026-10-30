<script setup lang="ts">
/**
 * 水印设置面板（内嵌于 导航站设置 → 水印设置）
 *
 * 作用范围：个人/销售/学生/教师**工作台**页面；导航站不显示（由 App.vue 路由判定）。
 * 所有修改即时生效并写入 settings store → 随 workbench.json 自动云同步。
 */
import { computed, ref } from 'vue'
import { useAppSettingsStore } from '@/stores/settings'
import IconPickerDialog from './IconPickerDialog.vue'
import { WATERMARK_LIMITS } from '@/types'
import type { WatermarkMode, WatermarkType } from '@/types'

/** embedded = true：作为设置页内嵌面板（无遮罩、无自带标题栏） */
defineProps<{ embedded?: boolean }>()

const store = useAppSettingsStore()
const L = WATERMARK_LIMITS

/** 透明度以「百分比」呈现更直观，内部存 0~1 小数 */
const opacityPercent = computed({
  get: () => Math.round(store.watermarkOpacity * 100),
  set: (v: number) => store.setWatermarkOpacity(v / 100)
})

/** 是否可渲染水印（开关 + 内容齐备），用于提示「当前不会显示」 */
const effectiveVisible = computed(() => {
  if (!store.watermarkEnabled) return false
  if (store.watermarkType === 'image') return /^data:image\//i.test(store.watermarkImage)
  return store.watermarkText.trim().length > 0
})

function pickImage(): void {
  pickerOpen.value = true
}

/** 选中图标 → 回填 data URL，并自动切到图片型（避免还要手动再点一次） */
function onPickIcon(dataUrl: string): void {
  store.setWatermarkImage(dataUrl)
  if (store.watermarkType !== 'image') store.setWatermarkType('image')
  pickerOpen.value = false
}

/** 图标选择弹框开关（自包含，参照 CategoryManager 范式） */
const pickerOpen = ref(false)

function setType(v: WatermarkType): void {
  store.setWatermarkType(v)
}
function setMode(v: WatermarkMode): void {
  store.setWatermarkMode(v)
}
</script>

<template>
  <div class="wm-panel" data-testid="watermark-settings">
    <!-- 总开关 -->
    <div class="wb-menu-head">
      <span class="wb-menu-label">启用水印</span>
      <el-switch
        :model-value="store.watermarkEnabled"
        @change="store.setWatermarkEnabled($event as boolean)"
        data-testid="wm-enabled-switch"
      />
    </div>
    <p class="wb-menu-hint">
      在<strong>个人工作台、销售记账、学生工作台、教师工作台</strong>页面覆盖显示水印；导航站不显示。
      水印为固定定位覆盖层，不占用页面空间、不影响点击与布局。此设置随云同步跨设备生效。
    </p>
    <p v-if="store.watermarkEnabled && !effectiveVisible" class="wm-warn" data-testid="wm-notice">
      {{
        store.watermarkType === 'image'
          ? '尚未选择水印图片，请在下方「图片水印」中从图标库挑选一张。'
          : '水印文字为空，请在上方「水印文字」中填写内容。'
      }}
    </p>

    <!-- 类型选择 -->
    <div class="wb-menu-head" style="margin-top:18px;">
      <span class="wb-menu-label">水印类型</span>
      <div class="wm-seg">
        <button
          type="button"
          class="wm-seg-btn"
          :class="{ 'is-on': store.watermarkType === 'text' }"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-type-text"
          @click="setType('text')"
        >文字水印</button>
        <button
          type="button"
          class="wm-seg-btn"
          :class="{ 'is-on': store.watermarkType === 'image' }"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-type-image"
          @click="setType('image')"
        >图片水印</button>
      </div>
    </div>

    <!-- 文字内容 / 图片选择 -->
    <div v-if="store.watermarkType === 'text'" class="form-group" style="margin-top:12px;">
      <label class="field-label" for="wm-text">水印文字</label>
      <input
        id="wm-text"
        type="text"
        class="wm-text-input"
        :value="store.watermarkText"
        maxlength="60"
        placeholder="例如：内部资料  请勿外传"
        :disabled="!store.watermarkEnabled"
        data-testid="wm-text-input"
        @input="store.setWatermarkText(($event.target as HTMLInputElement).value)"
      />
      <p class="wb-menu-hint">留空则不显示水印；最多 60 字。</p>
    </div>

    <div v-else class="form-group" style="margin-top:12px;">
      <span class="field-label">水印图片</span>
      <div class="wm-img-row">
        <span class="wm-img-preview" :class="{ 'is-empty': !store.watermarkImage }">
          <img v-if="store.watermarkImage" :src="store.watermarkImage" alt="水印图片预览" />
          <template v-else>未选择</template>
        </span>
        <button
          type="button"
          class="site-action-btn"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-pick-image"
          @click="pickImage"
        >从图标库选择</button>
        <button
          v-if="store.watermarkImage"
          type="button"
          class="site-action-btn"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-clear-image"
          @click="store.setWatermarkImage('')"
        >移除</button>
      </div>
      <p class="wb-menu-hint">从图标库（预置图标 + 已上传的自定义图标）中挑选，图片会以平铺方式重复显示。</p>
    </div>

    <!-- 展示方式 -->
    <div class="wb-menu-head" style="margin-top:18px;">
      <span class="wb-menu-label">展示方式</span>
      <div class="wm-seg">
        <button
          type="button"
          class="wm-seg-btn"
          :class="{ 'is-on': store.watermarkMode === 'tile' }"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-mode-tile"
          @click="setMode('tile')"
        >平铺</button>
        <button
          type="button"
          class="wm-seg-btn"
          :class="{ 'is-on': store.watermarkMode === 'center' }"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-mode-center"
          @click="setMode('center')"
        >居中</button>
      </div>
    </div>
    <p class="wb-menu-hint">平铺：网格状重复覆盖整页；居中：仅在页面正中显示一条（图片水印仅支持平铺）。</p>

    <!-- 样式参数 -->
    <div class="wm-sliders" :class="{ 'is-disabled': !store.watermarkEnabled }">
      <div class="wm-slider-row">
        <div class="wm-slider-head">
          <span class="field-label">不透明度</span>
          <span class="wm-slider-val">{{ opacityPercent }}%</span>
        </div>
        <input
          type="range"
          :min="Math.round(L.opacity.min * 100)"
          :max="Math.round(L.opacity.max * 100)"
          step="1"
          :value="opacityPercent"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-opacity"
          @input="store.setWatermarkOpacity(Number(($event.target as HTMLInputElement).value) / 100)"
        />
      </div>

      <div class="wm-slider-row">
        <div class="wm-slider-head">
          <span class="field-label">字号</span>
          <span class="wm-slider-val">{{ store.watermarkFontSize }} px</span>
        </div>
        <input
          type="range"
          :min="L.fontSize.min"
          :max="L.fontSize.max"
          :step="L.fontSize.step"
          :value="store.watermarkFontSize"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-fontsize"
          @input="store.setWatermarkFontSize(Number(($event.target as HTMLInputElement).value))"
        />
      </div>

      <div class="wm-slider-row">
        <div class="wm-slider-head">
          <span class="field-label">倾斜角度</span>
          <span class="wm-slider-val">{{ store.watermarkRotate }}°</span>
        </div>
        <input
          type="range"
          :min="L.rotate.min"
          :max="L.rotate.max"
          :step="L.rotate.step"
          :value="store.watermarkRotate"
          :disabled="!store.watermarkEnabled"
          data-testid="wm-rotate"
          @input="store.setWatermarkRotate(Number(($event.target as HTMLInputElement).value))"
        />
      </div>

      <template v-if="store.watermarkMode === 'tile'">
        <div class="wm-slider-row">
          <div class="wm-slider-head">
            <span class="field-label">横向间距</span>
            <span class="wm-slider-val">{{ store.watermarkGapX }} px</span>
          </div>
          <input
            type="range"
            :min="L.gapX.min"
            :max="L.gapX.max"
            :step="L.gapX.step"
            :value="store.watermarkGapX"
            :disabled="!store.watermarkEnabled"
            data-testid="wm-gapx"
            @input="store.setWatermarkGapX(Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div class="wm-slider-row">
          <div class="wm-slider-head">
            <span class="field-label">纵向间距</span>
            <span class="wm-slider-val">{{ store.watermarkGapY }} px</span>
          </div>
          <input
            type="range"
            :min="L.gapY.min"
            :max="L.gapY.max"
            :step="L.gapY.step"
            :value="store.watermarkGapY"
            :disabled="!store.watermarkEnabled"
            data-testid="wm-gapy"
            @input="store.setWatermarkGapY(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </template>
    </div>

    <div class="wm-actions">
      <button
        type="button"
        class="site-action-btn"
        data-testid="wm-reset"
        @click="store.resetWatermark()"
      >恢复默认</button>
    </div>
  </div>

  <!-- 水印图片选择弹框：复用图标库（IconPickerDialog），放在面板之外避免回车误提交 -->
  <IconPickerDialog
    v-if="pickerOpen"
    title="水印图片 · 选择图标"
    :current="store.watermarkImage"
    @select="onPickIcon"
    @close="pickerOpen = false"
  />
</template>

<style scoped>
.wm-panel {
  display: flex;
  flex-direction: column;
}

.wm-seg {
  display: inline-flex;
  gap: 6px;
}

/* 开关式 chip：与全局小按钮同规格（30px 高 / 8px 圆角 / 13px 字） */
.wm-seg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 var(--space-3, 12px);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary);
  background: var(--color-bg-card, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition:
    color var(--motion-duration, 160ms) var(--motion-ease, ease),
    border-color var(--motion-duration, 160ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 160ms) var(--motion-ease, ease);
}

.wm-seg-btn.is-on {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft, transparent);
}

.wm-seg-btn:disabled,
.wm-text-input:disabled,
.wm-sliders.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wm-text-input {
  width: 100%;
  max-width: 420px;
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 var(--space-3, 12px);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text);
  background: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  transition:
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 220ms) var(--motion-ease, ease);
}

.wm-text-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ring, rgba(59, 130, 246, 0.35));
}

.wm-warn {
  margin: 8px 0 0;
  padding: 7px 10px;
  font-size: 12px;
  color: var(--color-warning, #b45309);
  background: color-mix(in srgb, var(--color-warning, #b45309) 10%, transparent);
  border-radius: 6px;
}

.wm-img-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wm-img-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-hover);
  font-size: 12px;
  color: var(--color-text-tertiary, var(--color-text-secondary));
}

.wm-img-preview.is-empty {
  border-style: dashed;
}

.wm-img-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.wm-sliders {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}

.wm-slider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.wm-slider-val {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.wm-sliders input[type='range'] {
  width: 100%;
  max-width: 420px;
  accent-color: var(--color-primary);
}

.wm-actions {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}
</style>
