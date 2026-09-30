<script setup lang="ts">
/**
 * EXIF 查看与清除（本地解析 JPEG 元数据，可一键清除敏感信息）
 */
import { computed, ref } from 'vue'
import { parseExif, SENSITIVE_TAGS, type ExifTag } from '../../core/exif'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage, readFileAsBuffer } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

interface Meta {
  name: string
  size: number
  type: string
  w: number
  h: number
}

const meta = ref<Meta | null>(null)
const tags = ref<ExifTag[]>([])
const gps = ref<{ lat: number; lng: number } | null>(null)
const errorMsg = ref('')
const fileName = ref('')
const previewUrl = ref('')
const cleanedUrl = ref('')
const cleanedSize = ref(0)
const sourceImg = ref<HTMLImageElement | null>(null)

useDirtyFlag(() => !!fileName.value)
const { copy, saveBlob } = useToolActions()

const sensitiveCount = computed(() => tags.value.filter(t => SENSITIVE_TAGS.includes(t.name)).length)

const tagText = computed(() =>
  tags.value.map(t => `${t.group}\t${t.name}\t${t.value}`).join('\n')
)

async function onFiles(files: File[]) {
  errorMsg.value = ''
  tags.value = []
  gps.value = null
  cleanedUrl.value = ''
  cleanedSize.value = 0
  const file = files[0]
  fileName.value = file.name
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  try {
    sourceImg.value = await loadImage(file)
    meta.value = {
      name: file.name,
      size: file.size,
      type: file.type || '未知',
      w: sourceImg.value.naturalWidth,
      h: sourceImg.value.naturalHeight
    }
  } catch {
    meta.value = { name: file.name, size: file.size, type: file.type || '未知', w: 0, h: 0 }
    sourceImg.value = null
  }
  if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) {
    errorMsg.value = '仅 JPEG 文件包含标准 EXIF 段；PNG/WebP 等格式通常不含可解析的 EXIF。'
  }
  try {
    const buf = await readFileAsBuffer(file)
    const res = parseExif(buf)
    if (!res.ok) {
      errorMsg.value = res.error || '未解析到 EXIF 数据'
      return
    }
    tags.value = res.tags
    gps.value = res.gps || null
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

/** 清除元数据：经 canvas 重编码，天然不含 EXIF */
async function clean() {
  if (!sourceImg.value) {
    errorMsg.value = '请先选择可解析的图片'
    return
  }
  const img = sourceImg.value
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.92))
  if (!blob) {
    errorMsg.value = '重编码失败'
    return
  }
  if (cleanedUrl.value) URL.revokeObjectURL(cleanedUrl.value)
  cleanedUrl.value = URL.createObjectURL(blob)
  cleanedSize.value = blob.size
  cleanedBlob = blob
}

let cleanedBlob: Blob | null = null

function downloadCleaned() {
  if (!cleanedBlob) return
  const base = (fileName.value || 'photo').replace(/\.[^.]+$/, '')
  saveBlob(`${base}-clean.jpg`, cleanedBlob)
}
</script>

<template>
  <div class="tu-t1">
    <TuField label="选择照片（JPEG）">
      <TuDrop accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
    </TuField>

    <div v-if="previewUrl" class="tu-row">
      <img :src="previewUrl" alt="预览" style="max-height: 140px" />
    </div>

    <div v-if="meta" class="tu-stat">
      <span>{{ meta.name }}</span>
      <span>{{ meta.w }}×{{ meta.h }}</span>
      <span>{{ (meta.size / 1024).toFixed(1) }} KB</span>
      <span>{{ meta.type }}</span>
    </div>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <TuOutput
      title="元数据标签"
      :text="tagText"
      filename="exif.txt"
      empty="未读取到 EXIF 标签"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!tags.length" @click="copy(tagText)">复制全部</button>
      </template>
      <div v-if="tags.length" class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th style="width: 110px">分组</th>
              <th style="width: 150px">标签</th>
              <th>值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in tags" :key="i" :class="{ 'is-sensitive': SENSITIVE_TAGS.includes(t.name) }">
              <td>{{ t.group }}</td>
              <td>
                {{ t.name }}
                <span v-if="SENSITIVE_TAGS.includes(t.name)" class="tu-badge">敏感</span>
              </td>
              <td class="break">{{ t.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tu-out-empty">没有可展示的元数据</p>
    </TuOutput>

    <TuOutput
      v-if="gps"
      title="GPS 位置信息"
      :text="`纬度 ${gps.lat}，经度 ${gps.lng}`"
      filename="gps.txt"
      empty="无 GPS 信息"
    >
      <p class="tu-alert">该照片包含 GPS 坐标（{{ gps.lat.toFixed(6) }}, {{ gps.lng.toFixed(6) }}），分享前建议清除。</p>
    </TuOutput>

    <TuField label="清除元数据">
      <div class="tu-row">
        <button type="button" class="tu-btn" :disabled="!meta" @click="clean">生成无元数据副本</button>
        <button type="button" class="tu-btn ghost" :disabled="!cleanedUrl" @click="downloadCleaned">
          下载清洗后图片
        </button>
      </div>
      <p class="tu-hint">共检测到 {{ sensitiveCount }} 项敏感标签；清洗通过本地重编码实现，不上传原图。</p>
      <div v-if="cleanedUrl" class="tu-row">
        <img :src="cleanedUrl" alt="清洗后" style="max-height: 140px" />
        <span class="tu-hint">{{ (cleanedSize / 1024).toFixed(1) }} KB</span>
      </div>
    </TuField>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>选择 JPEG 照片后可查看拍摄参数、时间、GPS 等元数据。</li>
          <li>敏感标签（GPS、拍摄时间、设备等）会高亮提示。</li>
          <li>「生成无元数据副本」通过本地重编码剥离 EXIF，可直接下载。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
.tu-badge {
  margin-left: 4px;
  font-size: 10px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--color-error-soft);
  color: var(--color-error);
}
.tu-table tr.is-sensitive td { background: var(--color-error-soft); }
</style>
