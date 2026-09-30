<script setup lang="ts">
/**
 * 二维码扫描器（jsQR 本地识别，图片不上传）
 */
import { ref } from 'vue'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const fileName = ref('')
const previewUrl = ref('')
const result = ref('')
const errorMsg = ref('')
const busy = ref(false)
const kind = ref('')

useDirtyFlag(() => !!result.value)
const { copy } = useToolActions()

/** 识别内容类型，便于后续展示 */
function detectKind(text: string): string {
  if (/^https?:\/\//i.test(text)) return '网址链接'
  if (/^WIFI:/i.test(text)) return 'WiFi 配置'
  if (/^BEGIN:VCARD/i.test(text)) return '名片联系人'
  if (/^mailto:/i.test(text)) return '邮箱'
  if (/^tel:/i.test(text)) return '电话'
  if (/^SMSTO:/i.test(text)) return '短信'
  if (/^\d{6,}$/.test(text)) return '纯数字'
  return '文本内容'
}

async function onFiles(files: File[]) {
  errorMsg.value = ''
  result.value = ''
  kind.value = ''
  busy.value = true
  const file = files[0]
  fileName.value = file.name
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  try {
    const img = await loadImage(file)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const jsQR = (await import('jsqr')).default
    const res = jsQR(data.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })
    if (res && res.data) {
      result.value = res.data
      kind.value = detectKind(res.data)
    } else {
      errorMsg.value = '未能识别到二维码，请换一张更清晰的图片'
    }
  } catch (e) {
    errorMsg.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const wifiRows = ref<{ k: string; v: string }[]>([])

function parseWifi(text: string) {
  const rows: { k: string; v: string }[] = []
  const body = text.replace(/^WIFI:/i, '')
  const re = /(S|T|P|H):([^;]*)/g
  let m: RegExpExecArray | null
  const map: Record<string, string> = { S: '网络名称 SSID', T: '加密方式', P: '密码', H: '隐藏网络' }
  while ((m = re.exec(body))) rows.push({ k: map[m[1]] || m[1], v: m[2] })
  wifiRows.value = rows
}

function onResultChange() {
  if (/^WIFI:/i.test(result.value)) parseWifi(result.value)
}
</script>

<template>
  <div class="tu-t1">
    <TuField label="选择含二维码的图片">
      <TuDrop accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
    </TuField>

    <div v-if="previewUrl" class="tu-row">
      <img :src="previewUrl" alt="待识别图片" style="max-height: 220px" />
    </div>

    <p v-if="busy" class="tu-hint">识别中…</p>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <TuOutput
      title="识别结果"
      :text="result"
      filename="qr-result.txt"
      empty="选择图片后自动识别"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!result" @click="copy(result)">复制内容</button>
        <button type="button" class="tu-btn ghost" :disabled="!result" @click="onResultChange">解析结构</button>
      </template>
      <p v-if="result" class="tu-hint">类型：{{ kind }}</p>
      <pre v-if="result" class="tu-code">{{ result }}</pre>
      <p v-else class="tu-out-empty">暂无识别结果</p>
    </TuOutput>

    <TuOutput
      v-if="wifiRows.length"
      title="WiFi 配置明细"
      :text="wifiRows.map(r => `${r.k}: ${r.v}`).join('\n')"
      filename="wifi.txt"
      empty="—"
    >
      <div class="tu-table-wrap">
        <table class="tu-table">
          <tbody>
            <tr v-for="r in wifiRows" :key="r.k">
              <td style="width: 130px">{{ r.k }}</td>
              <td class="break">{{ r.v }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>选择或拖入包含二维码的图片，系统在本地识别并解析内容类型。</li>
          <li>WiFi 类二维码可点击「解析结构」查看 SSID、加密方式与密码。</li>
          <li>识别过程完全在本地完成，图片不会上传服务器。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
.tu-code {
  margin: 0;
  max-height: 200px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
