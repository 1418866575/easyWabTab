<script setup lang="ts">
/**
 * 文件加密 / 解密（Web Crypto AES-256-GCM，本地）
 * 加密：文件字节 → salt+iv+ciphertext(.enc)；解密：逆向还原原始文件。
 */
import { ref } from 'vue'
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
const fileName = ref('')

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) fileName.value = f.name
  errorMsg.value = ''
  msg.value = ''
}

async function run() {
  const input = fileInput.value
  const f = input?.files?.[0]
  if (!f) { errorMsg.value = '请选择文件'; return }
  if (!pass.value) { errorMsg.value = '请填写口令'; return }
  if (mode.value === 'encrypt' && pass.value !== confirm.value) { errorMsg.value = '两次口令不一致'; return }
  busy.value = true
  errorMsg.value = ''
  msg.value = ''
  try {
    const buf = new Uint8Array(await f.arrayBuffer())
    if (mode.value === 'encrypt') {
      const enc = await encryptBytes(buf, pass.value)
      downloadBlob(`${f.name}.enc`, new Blob([enc as unknown as BlobPart]))
      msg.value = '已加密并下载'
    } else {
      const dec = await decryptBytes(buf, pass.value)
      const outName = f.name.replace(/\.enc$/i, '') || 'decrypted'
      downloadBlob(outName, new Blob([dec as unknown as BlobPart]))
      msg.value = '已解密并下载'
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
          <button :class="{ 'is-on': mode === 'encrypt' }" @click="mode = 'encrypt'">加密</button>
          <button :class="{ 'is-on': mode === 'decrypt' }" @click="mode = 'decrypt'">解密</button>
        </div>
      </div>
      <div class="tu-field">
        <label class="tu-label">选择文件</label>
        <input ref="fileInput" type="file" hidden @change="onFile" />
        <button class="tu-btn ghost" @click="fileInput?.click()">选择文件</button>
        <span v-if="fileName" class="tu-hint">{{ fileName }}</span>
      </div>
      <div class="tu-field">
        <label class="tu-label">口令</label>
        <input v-model="pass" type="password" class="tu-input" />
      </div>
      <div v-if="mode === 'encrypt'" class="tu-field">
        <label class="tu-label">确认口令</label>
        <input v-model="confirm" type="password" class="tu-input" />
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy" @click="run">{{ busy ? '处理中…' : (mode === 'encrypt' ? '加密并下载' : '解密并下载') }}</button>
      </div>
    </div>
    <div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="msg" class="tu-alert ok">{{ msg }}</p>
      <p class="tu-hint">采用 AES-256-GCM + PBKDF2(SHA-256, 10万次) 派生密钥；口令与文件均不离开本机。加密文件请用本工具解密。</p>
    </div>
  </div>
</template>
