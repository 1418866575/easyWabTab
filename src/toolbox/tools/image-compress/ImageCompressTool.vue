<script setup lang="ts">
/**
 * 图片压缩（canvas 本地处理，图片不会上传到任何服务器）
 */
import { onBeforeUnmount, ref } from 'vue'
import { useToast } from '@/composables/useToast'

const quality = ref(0.8)
const maxWidth = ref(1600)
const output = ref('选择图片后点击「开始压缩」')
const downloadUrl = ref('')
const downloadName = ref('')
const { success, error } = useToast()

let fileRef: File | null = null

function onFileChange(e: Event) {
  const el = e.target as HTMLInputElement
  fileRef = el.files && el.files.length ? el.files[0] : null
  output.value = fileRef ? `已选择：${fileRef.name}（${(fileRef.size / 1024).toFixed(1)} KB）` : '选择图片后点击「开始压缩」'
}

function compress() {
  const file = fileRef
  if (!file) { error('请先选择一张图片'); return }

  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const mw = Math.max(100, Number(maxWidth.value) || 1600)
    const scale = Math.min(1, mw / img.width)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { URL.revokeObjectURL(url); output.value = '压缩失败：无法创建画布'; return }
    ctx.drawImage(img, 0, 0, w, h)

    const q = Math.min(1, Math.max(0.1, Number(quality.value) || 0.8))
    canvas.toBlob(blob => {
      URL.revokeObjectURL(url)
      if (!blob) { output.value = '压缩失败，请更换图片重试'; return }
      if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value)
      downloadUrl.value = URL.createObjectURL(blob)
      downloadName.value = 'compressed-' + file.name
      const rate = ((1 - blob.size / file.size) * 100).toFixed(1)
      output.value = [
        `原图：${(file.size / 1024).toFixed(1)} KB（${img.width}×${img.height}）`,
        `压缩后：${(blob.size / 1024).toFixed(1)} KB（${w}×${h}）`,
        `质量：${q}，体积减少：${rate}%`
      ].join('\n')
      success('压缩完成，可下载结果')
    }, 'image/jpeg', q)
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
    output.value = '图片读取失败'
  }
  img.src = url
}

onBeforeUnmount(() => {
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value)
})
</script>

<template>
  <div>
    <div class="tu-field">
      <label class="tu-label" for="ic-file">选择图片（本地处理，不上传任何服务器）</label>
      <input id="ic-file" type="file" accept="image/*" class="tu-input" @change="onFileChange" />
    </div>

    <div class="tu-row">
      <span class="tu-label">质量</span>
      <input v-model.number="quality" type="number" step="0.05" min="0.1" max="1" class="tu-input tu-inline" style="max-width:110px" />
      <span class="tu-label">最大宽度(px)</span>
      <input v-model.number="maxWidth" type="number" class="tu-input tu-inline" style="max-width:130px" />
      <button type="button" class="tu-btn" @click="compress">开始压缩</button>
    </div>

    <div class="tu-field">
      <span class="tu-label">压缩结果</span>
      <div class="tu-out" data-testid="tool-image-output">{{ output }}</div>
    </div>

    <a
      v-if="downloadUrl"
      class="tu-link"
      :href="downloadUrl"
      :download="downloadName"
    >下载压缩后的图片</a>
  </div>
</template>
