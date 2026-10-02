<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { downloadDataUrl } from '../../core/download'

const videoEl = ref<HTMLVideoElement | null>(null)
const previewUrl = ref('')
const errorMsg = ref('')
const streaming = ref(false)
let stream: MediaStream | null = null

async function start() {
  errorMsg.value = ''
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    errorMsg.value = '当前浏览器不支持摄像头访问（需运行在 HTTPS 或 localhost）'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
    }
    streaming.value = true
  } catch (e) { errorMsg.value = '无法开启摄像头：' + (e as Error).message }
}
function stop() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
  streaming.value = false
}
function capture() {
  if (!videoEl.value) return
  const v = videoEl.value
  const canvas = document.createElement('canvas')
  canvas.width = v.videoWidth || 640
  canvas.height = v.videoHeight || 480
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
  previewUrl.value = canvas.toDataURL('image/png')
}
function save() { if (previewUrl.value) downloadDataUrl('camera-' + Date.now() + '.png', previewUrl.value) }
onBeforeUnmount(stop)
</script>

<template>
  <div class="tu-t5">
    <div class="tu-row">
      <button class="tu-btn" :disabled="streaming" @click="start">开启摄像头</button>
      <button class="tu-btn ghost" :disabled="!streaming" @click="stop">关闭</button>
      <button class="tu-btn ghost" :disabled="!streaming" @click="capture">拍照</button>
      <button class="tu-btn ghost" :disabled="!previewUrl" @click="save">保存图片</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <div class="tu-canvas-box">
      <video ref="videoEl" playsinline muted style="display:block;max-width:100%" />
    </div>
    <div v-if="previewUrl" class="tu-field">
      <label class="tu-label">拍照预览</label>
      <div class="tu-preview"><img :src="previewUrl" alt="capture" /></div>
    </div>
    <p class="tu-hint">画面与照片仅在本地处理，不会上传。需授予摄像头权限，且页面运行在 https 或 localhost。</p>
  </div>
</template>
