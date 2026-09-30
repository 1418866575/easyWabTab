<script setup lang="ts">
/**
 * Cron 表达式解析（纯前端实现）
 * 支持 5 段（分 时 日 月 周）与 6 段（秒 分 时 日 月 周）
 */
import { computed, ref } from 'vue'
import { parseCron, type CronResult } from '../../core/cron'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const expr = ref('0 */2 * * 1-5')
const six = ref(false)
const count = ref(5)

useDirtyFlag(() => !!expr.value.trim())
const { copy } = useToolActions()

const res = computed<CronResult>(() => parseCron(expr.value, six.value, new Date(), Math.max(1, count.value)))

const PRESETS: { text: string; expr: string; six?: boolean }[] = [
  { text: '每分钟', expr: '* * * * *' },
  { text: '每小时整点', expr: '0 * * * *' },
  { text: '每天 02:00', expr: '0 2 * * *' },
  { text: '工作日 09:30', expr: '30 9 * * 1-5' },
  { text: '每月 1 号', expr: '0 0 1 * *' },
  { text: '每 10 秒（6 段）', expr: '*/10 * * * * *', six: true }
]

function usePreset(p: { text: string; expr: string; six?: boolean }) {
  expr.value = p.expr
  six.value = !!p.six
}
</script>

<template>
  <div class="tu-t1">
    <TuField label="Cron 表达式" :extra="six ? '6 段（秒 分 时 日 月 周）' : '5 段（分 时 日 月 周）'">
      <div class="tu-row">
        <input v-model="expr" class="tu-input" spellcheck="false" placeholder="0 */2 * * 1-5" />
        <button type="button" class="tu-check" :class="{ 'is-on': six }" @click="six = !six">6 段（含秒）</button>
      </div>
    </TuField>

    <div class="tu-toolbar">
      <span class="tu-label">常用示例</span>
      <button v-for="p in PRESETS" :key="p.text" type="button" class="tu-btn ghost" @click="usePreset(p)">
        {{ p.text }}
      </button>
    </div>

    <p v-if="res.error" class="tu-alert">{{ res.error }}</p>
    <p v-else class="tu-alert ok">{{ res.description }}</p>

    <div v-if="!res.error" class="tu-table-wrap">
      <table class="tu-table">
        <thead>
          <tr>
            <th style="width: 80px">字段</th>
            <th style="width: 120px">原始值</th>
            <th>取值范围</th>
            <th style="width: 80px">个数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in res.fields" :key="f.name">
            <td>{{ f.name }}</td>
            <td class="tu-mono">{{ f.raw }}</td>
            <td>{{ f.error ? f.error : f.text }}</td>
            <td>{{ f.values.length }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <TuField label="后续执行时间">
      <div class="tu-row">
        <span class="tu-label">生成条数</span>
        <input v-model.number="count" type="number" min="1" max="20" class="tu-input tu-inline" style="max-width: 100px" />
      </div>
    </TuField>

    <TuOutput
      title="未来执行时间"
      :text="res.next.join('\n')"
      filename="cron-next.txt"
      empty="表达式有效后显示未来执行时间"
    >
      <ol v-if="res.next.length" class="tu-list">
        <li v-for="(n, i) in res.next" :key="i" class="tu-mono">{{ n }}</li>
      </ol>
      <p v-else class="tu-out-empty">表达式有误或无法在合理范围内找到匹配时间</p>
    </TuOutput>

    <div class="tu-row">
      <button type="button" class="tu-btn ghost" :disabled="!expr.trim()" @click="copy(expr.trim(), '已复制 Cron 表达式')">
        复制表达式
      </button>
      <button type="button" class="tu-btn ghost" :disabled="!!res.error" @click="copy(res.description)">
        复制中文描述
      </button>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>支持 <code>*</code>、<code>*/n</code>、<code>a</code>、<code>a-b</code>、<code>a-b/n</code>、<code>a,b,c</code> 语法。</li>
          <li>
            另支持扩展语法：<code>L</code>（最后一天）、<code>L-n</code>、<code>nW</code>、<code>LW</code>、
            <code>nL</code>（当月最后一个星期 n）、<code>n#m</code>（第 m 个星期 n）、<code>?</code>。
          </li>
          <li>切换到 6 段模式可在最前面增加「秒」字段。</li>
          <li>执行时间基于浏览器本地时区计算，最多迭代 5 年内的匹配点。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8; }
</style>
