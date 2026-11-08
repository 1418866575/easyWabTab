<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppSettingsStore } from '@/stores/settings'
import { useAppSettingsDialog } from '@/composables/useAppSettingsDialog'
import { fetchWeather, weatherEmoji, weatherDesc, formatTime, type WeatherInfo } from '@/composables/useWeather'

/**
 * 天气卡（open-meteo，可配置城市）。
 * 读 settingsStore.workbenchCity：未配置（undefined/空串）固定显示占位「未设置城市」+「去设置」；
 * 配置后 watch 城市变化 → fetchWeather → 双行布局：
 *   第一行：城市名 + emoji + 温度 + 体感温度 + 天气描述
 *   第二行：湿度 + 风速 + 日出日落 + 高低温 + UV 指数
 * 加载中显示轻量占位，获取失败保持占位（静默降级，不 toast 不报错，无隐藏分支）。
 * compact：紧凑形态——去掉卡片外壳与明细行，只留城市/温度/一句话。当前无调用方
 *   （2026-11-06 起主页首行改成纯「时间 + 日期 + 周序号」，天气只在概览网格末尾出现一张完整卡），
 *   保留是因为它是一份独立的渲染分支、随时可复用到窄容器，不参与主页逻辑。
 * 只保留城市 / 天气 / 温度 / 简述 + 一行高低温，数据获取逻辑与普通卡完全共用。
 */
const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const settingsStore = useAppSettingsStore()
const { openAppSettings } = useAppSettingsDialog()

// 响应式 city（Pinia setup store 的 ref 解构会丢失响应性，须经 computed 派生）
const city = computed(() => settingsStore.workbenchCity)
const weather = ref<WeatherInfo | null>(null)
const loading = ref(false)

watch(
  () => settingsStore.workbenchCity,
  (newCity) => {
    weather.value = null
    if (!newCity || newCity.trim() === '') {
      loading.value = false
      return
    }
    loading.value = true
    void fetchWeather(newCity).then((result) => {
      weather.value = result // null = 失败，保持占位
      loading.value = false
    })
  },
  { immediate: true }
)
</script>

<template>
  <div class="weather-card" :class="{ 'is-compact': props.compact }" data-testid="wx-card">
    <!-- 未配置：固定占位 + 去设置（不做隐藏分支） -->
    <div v-if="!city" class="wx-placeholder">
      <span class="wx-placeholder-icon">🌤️</span>
      <span class="wx-placeholder-text">未设置城市</span>
      <el-button
        class="wx-setup-btn"
        data-testid="wx-setup-btn"
        @click="openAppSettings()"
        size="small"
      >去设置</el-button>
    </div>

    <!-- 已配置：成功显示天气数据；加载中/失败保持轻量占位（静默） -->
    <div v-else class="wx-body">
      <!-- 第一行：城市 + emoji + 温度 + 体感 + 描述 -->
      <div class="wx-row-1">
        <span class="wx-city" data-testid="wx-city">{{ city }}</span>
        <template v-if="weather">
          <span class="wx-emoji" data-testid="wx-emoji">{{ weatherEmoji(weather.code) }}</span>
          <span class="wx-temp" data-testid="wx-temp">{{ Math.round(weather.temp) }}°C</span>
          <span class="wx-feels" data-testid="wx-feels">体感 {{ Math.round(weather.feelsLike) }}°C</span>
          <span class="wx-desc" data-testid="wx-desc">{{ weatherDesc(weather.code, weather.isDay) }}</span>
        </template>
        <span v-else class="wx-loading" data-testid="wx-loading">{{ loading ? '加载中…' : '--°C' }}</span>
      </div>

      <!-- 紧凑形态：一行高低温收尾，不再渲染分割线与 6 项明细 -->
      <div v-if="props.compact && weather" class="wx-compact-detail" data-testid="wx-compact-detail">
        {{ city }} · {{ weatherDesc(weather.code, weather.isDay) }} · {{ Math.round(weather.dailyHigh) }}° / {{ Math.round(weather.dailyLow) }}°
      </div>

      <!-- 分割线 -->
      <div v-if="!props.compact" class="wx-divider"></div>

      <!-- 第二行：湿度 + 风速 + 日出日落 + 高低温 + UV -->
      <div v-if="!props.compact && weather" class="wx-row-2">
        <span class="wx-detail-item" data-testid="wx-humidity">💧 湿度 {{ weather.humidity }}%</span>
        <span class="wx-detail-item" data-testid="wx-wind">🌬️ 风速 {{ weather.windSpeed }} km/h</span>
        <span class="wx-detail-item" data-testid="wx-sunrise">🌅 日出 {{ formatTime(weather.sunrise) }}</span>
        <span class="wx-detail-item" data-testid="wx-sunset">🌇 日落 {{ formatTime(weather.sunset) }}</span>
        <span class="wx-detail-item" data-testid="wx-highlow">🔺 {{ Math.round(weather.dailyHigh) }}° / 🔻 {{ Math.round(weather.dailyLow) }}°</span>
        <span class="wx-detail-item" data-testid="wx-uv">☀️ UV {{ weather.uvIndex }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weather-card {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-top: 2px solid var(--color-primary);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

/* 紧凑形态：嵌进首页首行「日期 / 天气 各 50%」信息带，去掉独立卡片外壳 */
.weather-card.is-compact {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}
.weather-card.is-compact .wx-body { gap: 3px; }
.weather-card.is-compact .wx-row-1 { gap: 8px; }
.weather-card.is-compact .wx-city { font-size: var(--fs-caption); font-weight: 500; color: var(--color-text-secondary); }
.weather-card.is-compact .wx-temp { font-size: calc(var(--fs-title) + 2px); }
.weather-card.is-compact .wx-feels { display: none; }
.wx-compact-detail {
  font-size: calc(var(--fs-caption) - 1px);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wx-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wx-placeholder-icon {
  font-size: var(--fs-h2, 22px);
}

.wx-placeholder-text {
  font-size: var(--fs-body, 14px);
  color: var(--color-text-secondary);
}

.wx-setup-btn {
  flex-shrink: 0;
}

.wx-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.wx-row-1 {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.wx-divider {
  height: 1px;
  background: var(--color-border);
  opacity: 0.6;
}

.wx-row-2 {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-secondary);
}

.wx-city {
  font-size: var(--fs-body, 14px);
  font-weight: 600;
  color: var(--color-text);
}

.wx-emoji {
  font-size: var(--fs-h2, 22px);
  line-height: 1;
}

.wx-temp {
  font-size: var(--fs-h2, 22px);
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.wx-feels {
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary);
}

.wx-desc {
  font-size: var(--fs-sm, 13px);
  color: var(--color-text);
  font-weight: 500;
}

.wx-detail-item {
  white-space: nowrap;
}

.wx-loading {
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary);
}

/* ===== 暗色模式覆盖 ===== */
html.dark .weather-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .weather-card.is-compact {
  background-color: transparent;
  box-shadow: none;
}

html.dark .wx-placeholder-text,
html.dark .wx-row-2,
html.dark .wx-loading {
  color: var(--color-text-secondary);
}

html.dark .wx-city,
html.dark .wx-temp,
html.dark .wx-desc {
  color: var(--color-text);
}

html.dark .wx-feels {
  color: var(--color-text-secondary);
}

html.dark .wx-divider {
  background: #374151;
}
</style>
