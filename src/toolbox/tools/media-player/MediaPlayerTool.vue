<script setup lang="ts">
/**
 * 媒体播放器（本地文件，零上传）
 * 选择本地音频 / 视频文件，用浏览器原生控件播放。
 * 全程不联网、不上传，符合工具箱「零上传」硬约束。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { humanSize } from '../../core/download'

type MediaKind = 'audio' | 'video' | 'unknown'

interface MediaInfo {
  name: string
  mime: string
  size: number
  url: string
  kind: MediaKind
}

const fileInput = ref<HTMLInputElement | null>(null)
const info = ref<MediaInfo | null>(null)
const duration = ref<number | null>(null)
const isDragover = ref(false)

const ACCEPT = 'audio/*,video/*'

function pickFile() {
  fileInput.value?.click()
}

function handleFile(file: File) {
  if (info.value?.url) URL.revokeObjectURL(info.value.url)
  const isAudio = file.type.startsWith('audio/')
  const isVideo = file.type.startsWith('video/')
  const kind: MediaKind = isAudio ? 'audio' : isVideo ? 'video' : 'unknown'
  info.value = {
    name: file.name,
    mime: file.type || '未知类型',
    size: file.size,
    url: URL.createObjectURL(file),
    kind
  }
  duration.value = null
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleFile(file)
  input.value = '' // 允许再次选择同一文件
}

function onDrop(e: DragEvent) {
  isDragover.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function onDuration(e: Event) {
  const el = e.target as HTMLMediaElement
  duration.value = isFinite(el.duration) ? el.duration : null
}

function fmtDuration(s: number | null): string {
  if (s == null || !isFinite(s)) return '—'
  const total = Math.floor(s)
  const sec = total % 60
  const min = Math.floor(total / 60) % 60
  const hr = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return hr > 0 ? `${hr}:${pad(min)}:${pad(sec)}` : `${min}:${pad(sec)}`
}

const canPlay = computed(
  () => !!info.value && (info.value.kind === 'audio' || info.value.kind === 'video')
)

onBeforeUnmount(() => {
  if (info.value?.url) URL.revokeObjectURL(info.value.url)
})
</script>

<template>
  <div class="tu-t1 media-player">
    <input
      ref="fileInput"
      type="file"
      :accept="ACCEPT"
      class="mp-hidden-input"
      @change="onFileChange"
    />

    <div
      class="mp-drop"
      :class="{ 'is-over': isDragover }"
      @click="pickFile"
      @dragover.prevent="isDragover = true"
      @dragleave.prevent="isDragover = false"
      @drop.prevent="onDrop"
    >
      <div class="mp-drop-icon">🎬</div>
      <div class="mp-drop-title">点击选择，或拖入音频 / 视频文件</div>
      <div class="mp-drop-sub">支持 mp3 / wav / ogg / mp4 / webm 等浏览器可播放格式</div>
    </div>

    <p v-if="info && !canPlay" class="tu-alert">
      无法识别的媒体类型（{{ info.mime }}），请选择浏览器支持的音频或视频文件。
    </p>

    <template v-if="canPlay && info">
      <div class="mp-stage">
        <audio
          v-if="info.kind === 'audio'"
          :src="info.url"
          controls
          class="mp-media"
          @loadedmetadata="onDuration"
        />
        <video
          v-else
          :src="info.url"
          controls
          class="mp-media"
          @loadedmetadata="onDuration"
        />
      </div>

      <div class="tu-grid">
        <div class="tu-card">
          <div class="tu-card-title">文件名</div>
          <div class="tu-card-value mp-name">{{ info.name }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">类型</div>
          <div class="tu-card-value">{{ info.mime }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">大小</div>
          <div class="tu-card-value">{{ humanSize(info.size) }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">时长</div>
          <div class="tu-card-value">{{ fmtDuration(duration) }}</div>
        </div>
      </div>
    </template>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>文件仅在本地浏览器内解码播放，不会被上传到任何服务器。</li>
          <li>关闭工具或重新选择文件时会自动释放内存（Object URL）。</li>
          <li>能否播放取决于浏览器对编码格式的支持；若无法播放请转码为 mp3 / mp4。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.media-player { max-width: 640px; }
.mp-hidden-input { display: none; }
.mp-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  text-align: center;
  background: var(--color-bg-input);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.mp-drop:hover,
.mp-drop.is-over {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.mp-drop-icon { font-size: 34px; line-height: 1; }
.mp-drop-title { font-size: 13px; color: var(--color-text); }
.mp-drop-sub { font-size: 11.5px; color: var(--color-text-muted); }
.mp-stage {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-input);
  padding: 10px;
}
.mp-media { width: 100%; display: block; outline: none; }
.mp-name { font-size: 14px; word-break: break-all; }
</style>
