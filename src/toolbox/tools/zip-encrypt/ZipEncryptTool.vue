<script setup lang="ts">
/**
 * 加密压缩包（jszip + Web Crypto AES-256-GCM，本地）
 * 加密：多文件 → ZIP → AES-GCM 加密 → .zip.enc
 * 解密：.enc → AES-GCM 解密 → ZIP → 还原各文件
 */
import { ref } from 'vue'
import JSZip from 'jszip'
import { encryptBytes, decryptBytes } from '../../core/cryptoFile'
import { downloadBlob } from '../../core/download'

type Mode = 'encrypt' | 'decrypt'
const mode = ref<Mode>('encrypt')
const fileInput = ref<HTMLInputElement | null>(null)
const pass = ref('')
const confirm = ref('')
const busy = ref(false)
const errorMsg = ref('')
const msg = ref('')
const fileList = ref<string[]>([])

async function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  fileList.value = files.map(f => f.name)
  errorMsg.value = ''
  msg.value = ''
}

async function run() {
  const input = fileInput.value
  const files = Array.from(input?.files || [])
  if (!files.length) { errorMsg.value = '请选择文件'; return }
  if (!pass.value) { errorMsg.value = '请填写口令'; return }
  if (mode.value === 'encrypt' && pass.value !== confirm.value) { errorMsg.value = '两次口令不一致'; return }
  busy.value = true
  errorMsg.value = ''
  msg.value = ''
  try {
    if (mode.value === 'encrypt') {
      const zip = new JSZip()
      for (const f of files) zip.file(f.name, f)
      const blob = await zip.generateAsync({ type: 'uint8array' })
      const enc = await encryptBytes(blob, pass.value)
      downloadBlob(`archive-${Date.now()}.zip.enc`, new Blob([enc as unknown as BlobPart]))
      msg.value = `已打包 ${files.length} 个文件并加密`
    } else {
      const buf = new Uint8Array(await files[0].arrayBuffer())
      const dec = await decryptBytes(buf, pass.value)
      const zip = await JSZip.loadAsync(dec)
      const names = Object.keys(zip.files)
      for (const name of names) {
        const c = await zip.files[name].async('blob')
        downloadBlob(name, c)
      }
      msg.value = `已解密并还原 ${names.length} 个文件`
    }
  } catch (err) {
    errorMsg.value = '处理失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">模式</label>
        <div class="tu-seg">
          <button :class="{ 'is-on': mode === 'encrypt' }" @click="mode = 'encrypt'">加密打包</button>
          <button :class="{ 'is-on': mode === 'decrypt' }" @click="mode = 'decrypt'">解密还原</button>
        </div>
      </div>
      <div class="tu-field">
        <label class="tu-label">{{ mode === 'encrypt' ? '选择文件（可多选）' : '选择 .enc 加密包' }}</label>
        <input ref="fileInput" type="file" :multiple="mode === 'encrypt'" hidden @change="onFiles" />
        <button class="tu-btn ghost" @click="fileInput?.click()">选择文件</button>
      </div>
      <div v-if="fileList.length" class="tu-hint">{{ fileList.join('、') }}</div>
      <div class="tu-field">
        <label class="tu-label">口令</label>
        <input v-model="pass" type="password" class="tu-input" />
      </div>
      <div v-if="mode === 'encrypt'" class="tu-field">
        <label class="tu-label">确认口令</label>
        <input v-model="confirm" type="password" class="tu-input" />
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy" @click="run">{{ busy ? '处理中…' : (mode === 'encrypt' ? '打包并加密' : '解密并还原') }}</button>
      </div>
    </div>
    <div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="msg" class="tu-alert ok">{{ msg }}</p>
      <p class="tu-hint">先 ZIP 打包再用 AES-256-GCM 加密；口令不离开本机。解密请用本工具。</p>
    </div>
  </div>
</template>
