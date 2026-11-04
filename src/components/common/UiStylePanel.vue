<script setup lang="ts">
/**
 * 界面美化面板（设置 → 个性化 → 界面美化）。
 *
 * 只负责「展示调节项 + 触发写入」，不含任何视觉实现：
 *   - 选项清单 / 预设配方来自 src/config/uiStyle.ts
 *   - 写变量 / 持久化来自 src/composables/useUiStyle.ts
 *   - 生效规则来自 src/styles/ui-style.css
 * 这样新增一项只需改 config + css，本组件自动多出一行。
 */
import { computed, ref } from 'vue'
import { UI_STYLE_GROUPS, UI_STYLE_PRESETS } from '@/config/uiStyle'
import { matchesPreset } from '@/composables/uiStyleCore'
import { useUiStyle } from '@/composables/useUiStyle'
import { useToast } from '@/composables/useToast'

const { state, changedCount, isDefault, cssText, setKnob, reset, applyPreset, importState } = useUiStyle()
const toast = useToast()
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

/** 当前状态恰好等于哪个配方（微调后自动熄灭） */
const activePreset = computed(() => {
  const hit = UI_STYLE_PRESETS.find((p) => matchesPreset(state.value, p))
  return hit ? hit.key : ''
})

/** 预览用假数据：表格行距 / 字号 / 间距的变化都在这里体现 */
const previewRows = [
  { name: '示例条目一', value: '12.00' },
  { name: '示例条目二', value: '38.50' }
]

async function handleCopy() {
  busy.value = true
  try {
    await navigator.clipboard.writeText(cssText.value)
    toast.success('已复制 CSS 覆盖片段')
  } catch {
    toast.error('复制失败，请手动选中导出内容')
  } finally {
    busy.value = false
  }
}

/** 导出为 JSON：换设备 / 给同事复用时比 CSS 片段更可靠（导入走同一份 state） */
function handleExportJson() {
  const blob = new Blob([JSON.stringify(state.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'easy-web-tab-ui-style.json'
  a.click()
  URL.revokeObjectURL(url)
  toast.success('已导出配置文件')
}

async function handleImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    importState(JSON.parse(await file.text()))
    toast.success('已导入界面美化配置')
  } catch {
    toast.error('配置文件解析失败，需为导出的 JSON')
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div class="hub" data-testid="ui-style-panel">
    <p class="hub-lead">
      这里的每一项都是<b>同类元素的默认规则</b>：改一次，全站同类型元素一起变（导航站 + 四个工作台）。
      默认值即项目规范现值，全部回到默认＝与未开启过此页完全一致。设置保存在本机，不随云同步 ——
      字号与密度是设备相关偏好，小屏调大不该把大屏也顶大。
    </p>

    <!-- 预设配方：先选方向，再微调。10 个开关没人愿意逐个试。 -->
    <div class="hub-presets">
      <div class="hub-presets-head">
        <span class="hub-label">快捷方案</span>
        <span class="hub-hint">选一个整体方向，下面各项再按需微调（微调后方案高亮自动熄灭）</span>
      </div>
      <div class="hub-preset-list">
        <button
          v-for="p in UI_STYLE_PRESETS"
          :key="p.key"
          type="button"
          class="hub-preset"
          :class="{ active: activePreset === p.key }"
          :aria-pressed="activePreset === p.key"
          :data-testid="`ui-style-preset-${p.key}`"
          @click="applyPreset(p)"
        >
          <span class="hub-preset-label">{{ p.label }}</span>
          <span class="hub-preset-desc">{{ p.desc }}</span>
        </button>
      </div>
    </div>

    <!-- 实时预览：调完立刻能看到，避免「不知道改的是哪」 -->
    <div class="ui-card hub-preview">
      <div class="hub-preview-head">
        <span class="hub-preview-title">实时预览</span>
        <span class="hub-preview-badge">{{ isDefault ? '默认规则' : `已调整 ${changedCount} 项` }}</span>
      </div>
      <div class="hub-preview-row">
        <input class="ui-input hub-preview-input" value="输入内容示例" readonly />
        <button type="button" class="ui-btn ui-btn--primary">主操作</button>
        <button type="button" class="ui-btn">次要</button>
      </div>
      <div class="hub-preview-fields">
        <div class="hub-preview-field">
          <span class="hub-preview-label">客户名称</span>
          <span class="hub-preview-value">示例内容，观察字号与行距</span>
        </div>
        <div class="hub-preview-field">
          <span class="hub-preview-label">负责人</span>
          <span class="hub-preview-value">示例内容，观察字号与行距</span>
        </div>
      </div>
      <!-- 表格：表格行距只能靠真表格看出来，用 EP 表格保证与业务表同源 -->
      <el-table :data="previewRows" size="small" class="hub-preview-table">
        <el-table-column prop="name" label="条目" />
        <el-table-column prop="value" label="金额" width="120" align="right" />
      </el-table>
    </div>

    <section v-for="group in UI_STYLE_GROUPS" :key="group.key" class="hub-group">
      <h4 class="hub-group-title">{{ group.label }}</h4>
      <div v-for="knob in group.knobs" :key="knob.key" class="hub-row">
        <div class="hub-row-text">
          <span class="hub-label">{{ knob.label }}</span>
          <span class="hub-hint">{{ knob.affects }}</span>
        </div>
        <div class="seg-control" role="group" :aria-label="knob.label">
          <button
            v-for="opt in knob.options"
            :key="opt.value"
            type="button"
            class="seg-opt"
            :class="{ active: state[knob.key] === opt.value }"
            :aria-pressed="state[knob.key] === opt.value"
            :data-testid="`ui-style-${knob.key}-${opt.value}`"
            @click="setKnob(knob.key, opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>
    </section>

    <div class="hub-actions">
      <button type="button" class="ui-btn" :disabled="isDefault" data-testid="ui-style-reset" @click="reset">恢复默认</button>
      <button type="button" class="ui-btn" :disabled="busy" data-testid="ui-style-copy" @click="handleCopy">复制 CSS 覆盖</button>
      <button type="button" class="ui-btn" data-testid="ui-style-export" @click="handleExportJson">导出配置</button>
      <button type="button" class="ui-btn" data-testid="ui-style-import" @click="fileInput?.click()">导入配置</button>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hub-file" @change="handleImportFile" />
    </div>
    <p class="hub-hint hub-foot">
      「复制 CSS 覆盖」得到的片段可粘进 <code>src/styles/ui-style.css</code> 末尾固化，把当前外观变成项目默认值；
      「导出配置」是同样内容的 JSON（导入走同一份数据，换设备或给同事复用更省事）。两者都只包含与默认值不同的项。
    </p>
  </div>
</template>

<style scoped>
.hub {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.hub-lead {
  margin: 0;
  font-size: var(--fs-sm, 13px);
  line-height: var(--line-height-base, 1.6);
  color: var(--color-text-muted);
}

.hub-lead b {
  color: var(--color-text);
  font-weight: 600;
}

/* ---------- 预设配方 ---------- */
.hub-presets {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.hub-presets-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hub-preset-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-2, 8px);
}

.hub-preset {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-card);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}

.hub-preset:hover {
  border-color: var(--color-border-hover);
  background-color: var(--color-bg-hover);
}

.hub-preset.active {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
}

.hub-preset-label {
  font-size: var(--fs-sm, 13px);
  font-weight: 600;
  color: var(--color-text);
}

.hub-preset.active .hub-preset-label {
  color: var(--color-primary-text);
}

.hub-preset-desc {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-muted);
}

/* ---------- 预览 ---------- */
.hub-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--ui-card-pad);
}

.hub-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
}

.hub-preview-title {
  font-size: var(--fs-body, 14px);
  font-weight: 600;
  color: var(--color-text);
}

.hub-preview-badge {
  padding: 2px var(--space-2, 8px);
  border-radius: var(--radius-full, 9999px);
  background-color: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: var(--fs-caption, 12px);
}

.hub-preview-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2, 8px);
}

.hub-preview-input {
  flex: 1 1 160px;
  min-width: 0;
}

.hub-preview-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3, 12px);
}

.hub-preview-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-surface-2);
}

.hub-preview-label {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-muted);
}

.hub-preview-value {
  font-size: var(--fs-body, 14px);
  color: var(--color-text);
}

/* 预览表格去掉外框，只保留行距与表头底色（行距由 ui-style.css 的表格规则控制） */
.hub-preview-table {
  --el-table-border-color: var(--color-border);
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--color-surface-2);
}

/* ---------- 调节项 ---------- */
.hub-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.hub-group-title {
  margin: 0;
  font-size: var(--fs-body, 14px);
  font-weight: 600;
  color: var(--color-text);
}

.hub-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-card);
}

.hub-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hub-label {
  font-size: var(--fs-sm, 13px);
  font-weight: 500;
  color: var(--color-text);
}

.hub-hint {
  font-size: var(--fs-caption, 12px);
  line-height: var(--line-height-base, 1.6);
  color: var(--color-text-muted);
}

.hub-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.hub-file {
  display: none;
}

.hub-foot {
  margin: 0;
}

.hub-foot code {
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm, 4px);
  background-color: var(--color-bg-hover);
  font-size: var(--fs-caption, 12px);
}

@media (max-width: 768px) {
  .hub-row {
    flex-direction: column;
    align-items: stretch;
  }

  .seg-control {
    align-self: flex-start;
  }
}
</style>
