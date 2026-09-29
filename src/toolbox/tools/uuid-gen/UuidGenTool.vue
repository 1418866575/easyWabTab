<script setup lang="ts">
/**
 * UUID / ID 生成器（v4 / v7 / NanoID / ULID / ObjectId / 短 ID）
 */
import { computed, ref } from 'vue'
import { genIds, parseUuid, type IdType } from '../../core/ids'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const type = ref<IdType>('uuid-v4')
const count = ref(5)
const uppercase = ref(false)
const nanoidSize = ref(21)
const shortSize = ref(12)
const ids = ref<string[]>([])
const inspect = ref('')

useDirtyFlag(() => ids.value.length > 0)
const { copy, save } = useToolActions()

const TYPES: { id: IdType; name: string; desc: string }[] = [
  { id: 'uuid-v4', name: 'UUID v4', desc: '随机 128 位，最常用' },
  { id: 'uuid-v7', name: 'UUID v7', desc: '含时间前缀，索引友好' },
  { id: 'nanoid', name: 'NanoID', desc: '短小 URL 安全字符串' },
  { id: 'ulid', name: 'ULID', desc: '可排序、含时间戳' },
  { id: 'objectid', name: 'ObjectId', desc: 'MongoDB 风格 24 位十六进制' },
  { id: 'short', name: '短 ID', desc: '自定义长度的随机短码' }
]

function generate() {
  ids.value = genIds(type.value, Math.max(1, Math.min(500, Number(count.value) || 1)), {
    nanoidSize: Number(nanoidSize.value) || 21,
    shortSize: Number(shortSize.value) || 12,
    uppercase: uppercase.value
  })
}

const idText = computed(() => ids.value.join('\n'))
const currentDesc = computed(() => TYPES.find(t => t.id === type.value)?.desc || '')

const parsed = computed(() => (inspect.value.trim() ? parseUuid(inspect.value) : { ok: false }))

generate()
</script>

<template>
  <div class="tu-t1">
    <TuField label="ID 类型" :hint="currentDesc">
      <div class="tu-toolbar">
        <button
          v-for="t in TYPES"
          :key="t.id"
          type="button"
          class="tu-check"
          :class="{ 'is-on': type === t.id }"
          @click="type = t.id"
        >{{ t.name }}</button>
      </div>
    </TuField>

    <div class="tu-row">
      <span class="tu-label">数量</span>
      <input v-model.number="count" type="number" min="1" max="500" class="tu-input tu-inline" style="max-width: 110px" />
      <button type="button" class="tu-check" :class="{ 'is-on': uppercase }" @click="uppercase = !uppercase">
        大写输出
      </button>
      <template v-if="type === 'nanoid'">
        <span class="tu-label">长度</span>
        <input v-model.number="nanoidSize" type="number" min="4" max="64" class="tu-input tu-inline" style="max-width: 100px" />
      </template>
      <template v-if="type === 'short'">
        <span class="tu-label">长度</span>
        <input v-model.number="shortSize" type="number" min="4" max="64" class="tu-input tu-inline" style="max-width: 100px" />
      </template>
      <button type="button" class="tu-btn" @click="generate">生成</button>
    </div>

    <TuOutput
      :title="`生成结果（${ids.length} 个）`"
      :text="idText"
      filename="ids.txt"
      empty="点击「生成」"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!ids.length" @click="copy(idText)">复制全部</button>
        <button type="button" class="tu-btn ghost" :disabled="!ids.length" @click="save('ids.txt', idText)">下载</button>
      </template>
      <div class="tu-table-wrap">
        <table class="tu-table">
          <tbody>
            <tr v-for="(id, i) in ids" :key="i">
              <td style="width: 40px; color: var(--color-text-muted)">{{ i + 1 }}</td>
              <td class="tu-mono break">
                {{ id }}
                <button type="button" class="tu-link" @click="copy(id)">复制</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </TuOutput>

    <TuField label="UUID 解析（版本 / 变体 / 时间）">
      <input v-model="inspect" class="tu-input" spellcheck="false" placeholder="粘贴一个 UUID 进行解析" />
      <p v-if="inspect && !parsed.ok" class="tu-alert">{{ parsed.error }}</p>
      <div v-else-if="parsed.ok" class="tu-stat">
        <span>版本 v{{ parsed.version }}</span>
        <span>变体 {{ parsed.variant }}</span>
        <span v-if="parsed.time">生成时间 {{ parsed.time }}</span>
      </div>
    </TuField>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>选择类型与数量后点击生成，最多一次 500 个。</li>
          <li>UUID v7 与 ULID 内含时间戳，可按时间排序，适合做数据库主键。</li>
          <li>随机源使用 crypto.getRandomValues，适合生产环境使用。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.break { word-break: break-all; }
</style>
