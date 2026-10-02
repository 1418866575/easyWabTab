<script setup lang="ts">
/**
 * PDF 解锁（纯前端，pdf-lib）
 * 用用户提供的「打开密码」加载加密 PDF，重新保存为不带密码的 PDF 实现解锁。
 * 明确边界：不做密码爆破；密码错误 / 非加密 / 解析失败均有提示。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const fileName = ref('')
const baseName = ref('doc')

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  infoMsg.value = ''
  fileName.value = f.name
  baseName.value = f.name.replace(/\.pdf$/i, '')
  ;(e.target as HTMLInputElement).value = ''
}

async function unlock() {
  const input = fileInput.value
  if (!input?.files?.length) {
    errorMsg.value = '请先选择 PDF 文件'
    return
  }
  const f = input.files[0]
  const password = (document.getElementById('pdf-unlock-pw') as HTMLInputElement)?.value || ''
  busy.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const bytes = new Uint8Array(await f.arrayBuffer())
    const doc = await PDFDocument.load(bytes, { password: password || undefined })
    const blob = new Blob([await doc.save()], { type: 'application/pdf' })
    downloadBlob(`${baseName.value}-unlocked.pdf`, blob)
    infoMsg.value = '已移除密码并下载（若该文件本未加密，则为原样另存）。'
  } catch (err) {
    const msg = (err as Error).message || String(err)
    if (/password/i.test(msg)) errorMsg.value = '密码错误或文件已损坏：请提供正确的打开密码。'
    else errorMsg.value = '解锁失败：' + msg
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t1 pdf-unlock">
    <div class="tu-field">
      <label class="tu-label">选择加密 PDF</label>
      <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
      <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">选择 PDF</button>
      <span v-if="fileName" class="tu-row" style="margin-top:8px">{{ fileName }}</span>
    </div>

    <div class="tu-field">
      <label class="tu-label" for="pdf-unlock-pw">打开密码（已知密码，留空表示尝试无密码）</label>
      <input id="pdf-unlock-pw" type="password" class="tu-input" autocomplete="off" placeholder="请输入 PDF 的打开密码" />
    </div>

    <button type="button" class="tu-btn" :disabled="busy || !fileName" @click="unlock">
      {{ busy ? '处理中…' : '解锁并下载' }}
    </button>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>

    <p class="tu-hint">
      本工具仅在你已知密码的前提下移除打开保护，不会尝试破解未知密码。文件全程在本地浏览器处理，不上传任何服务器。
    </p>
  </div>
</template>

<style scoped>
.pdf-unlock { max-width: 520px; }
</style>
