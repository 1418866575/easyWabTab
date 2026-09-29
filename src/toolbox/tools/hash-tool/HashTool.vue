<script setup lang="ts">
/**
 * Hash 生成器与 HMAC（crypto-js，纯前端实现）
 */
import { computed, ref } from 'vue'
import { HASH_ALGS, hashMany, hashText, hmacText, type HashAlg } from '../../core/hash'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const text = ref('easy-web-tab')
const upper = ref(false)
const hmacOn = ref(false)
const key = ref('secret')
const selected = ref<HashAlg[]>(['md5', 'sha1', 'sha256'])

useDirtyFlag(() => !!text.value.trim())
const { copy } = useToolActions()

const rows = computed(() => {
  const list = selected.value.length ? selected.value : (['sha256'] as HashAlg[])
  return hashMany(text.value, list, { upper: upper.value, hmac: hmacOn.value, key: key.value })
})

const allText = computed(() => rows.value.map(r => `${r.name}\t${r.value}`).join('\n'))

function toggle(alg: HashAlg) {
  const i = selected.value.indexOf(alg)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(alg)
}
</script>

<template>
  <div class="tu-t1">
    <TuField label="待计算文本">
      <textarea
        v-model="text"
        class="tu-textarea"
        rows="4"
        spellcheck="false"
        placeholder="输入文本"
        data-testid="tb-modal-input"
      />
    </TuField>

    <div class="tu-toolbar">
      <span class="tu-label">算法</span>
      <button
        v-for="a in HASH_ALGS"
        :key="a.id"
        type="button"
        class="tu-check"
        :class="{ 'is-on': selected.includes(a.id) }"
        @click="toggle(a.id)"
      >{{ a.name }}</button>
    </div>

    <div class="tu-row">
      <button type="button" class="tu-check" :class="{ 'is-on': upper }" @click="upper = !upper">大写输出</button>
      <button type="button" class="tu-check" :class="{ 'is-on': hmacOn }" @click="hmacOn = !hmacOn">HMAC 模式</button>
      <input
        v-if="hmacOn"
        v-model="key"
        class="tu-input tu-inline"
        style="max-width: 220px"
        placeholder="HMAC 密钥"
        autocomplete="off"
      />
    </div>

    <TuOutput
      :title="hmacOn ? `HMAC 结果（密钥已应用）` : '摘要结果'"
      :text="allText"
      filename="hash.txt"
      empty="请至少选择一个算法"
    >
      <div class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th style="width: 100px">算法</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.alg">
              <td>{{ r.name }}</td>
              <td class="tu-mono break">{{ r.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </TuOutput>

    <div class="tu-row">
      <button type="button" class="tu-btn ghost" :disabled="!allText" @click="copy(allText)">复制全部</button>
      <button
        v-for="r in rows"
        :key="'c' + r.alg"
        type="button"
        class="tu-btn ghost"
        @click="copy(r.value)"
      >复制 {{ r.name }}</button>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>支持 MD5 / SHA-1 / SHA-224 / SHA-256 / SHA-384 / SHA-512，可多选并行计算。</li>
          <li>开启 HMAC 模式后按所选算法计算带密钥的消息认证码。</li>
          <li>MD5 / SHA-1 已不推荐用于安全场景，仅作校验与兼容用途。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.break { word-break: break-all; }
</style>
