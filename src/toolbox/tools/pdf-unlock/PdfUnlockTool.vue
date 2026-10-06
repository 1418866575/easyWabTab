<script setup lang="ts">
/**
 * PDF 解锁 / 去保护（纯前端，pdf-lib）
 *
 * 能力边界（重要）：pdf-lib **不支持解密**——它只识别加密并抛 EncryptedPDFError，
 * 没有「用密码解密」的 API。因此本工具只能做「去保护」：对未加密 PDF 重新保存，
 * 顺带清掉文档内的编辑/复制限制等权限标记；对加密文件会明确报错并说明原因，
 * 而不是让用户填一个根本没被使用的密码框。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { pdfBlob, downloadBlob } from '../../core/download'

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
  busy.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const bytes = new Uint8Array(await f.arrayBuffer())
    // ignoreEncryption: true = 遇到加密不抛错、按原样读入（此时解密仍不可能，见文件头说明）
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    if (doc.isEncrypted) {
      errorMsg.value = '该 PDF 设有打开密码，纯前端无法解密（pdf-lib 不支持解密算法）。请用专业工具先解密后再来。'
      return
    }
    const blob = pdfBlob(await doc.save())
    downloadBlob(`${baseName.value}-unlocked.pdf`, blob)
    infoMsg.value = '已重新保存（未加密文件将原样另存；文档内的编辑/复制限制标记会被清除）。'
  } catch (err) {
    errorMsg.value = '处理失败：' + ((err as Error).message || String(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t1 pdf-unlock">
    <div class="tu-field">
      <label class="tu-label">选择 PDF</label>
      <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
      <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">选择 PDF</button>
      <span v-if="fileName" class="tu-row" style="margin-top:8px">{{ fileName }}</span>
    </div>

    <button type="button" class="tu-btn" :disabled="busy || !fileName" @click="unlock">
      {{ busy ? '处理中…' : '去保护并下载' }}
    </button>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>

    <p class="tu-hint">
      可清除文档内的编辑 / 复制等权限限制标记。<b>设有打开密码的加密文件无法在此解密</b>（纯前端库不具备解密能力），需先用专业工具解密。文件全程在本地浏览器处理，不上传任何服务器。
    </p>
  </div>
</template>

<style scoped>
.pdf-unlock { max-width: 520px; }
</style>
