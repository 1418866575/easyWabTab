<script setup lang="ts">
/**
 * IP 查询：本机公网 IP 回显 + 地址性质解析 + 域名 DoH 解析
 *
 * 边界（务必保留在 UI 提示里）：
 * - 公网 IP 与 DoH 解析需要发起网络请求，失败时如实报错，不伪造结果
 * - 「归属地 / ASN」需要服务端数据源，本期不提供
 */
import { computed, ref } from 'vue'
import {
  buildDohUrl,
  cidrInfo,
  DOH_PROVIDERS,
  ECHO_ENDPOINTS,
  isPrivateIp,
  ipv4ToBinary,
  ipv4ToDecimal,
  NATURE_LABEL,
  natureOf,
  normalizeDns,
  validateDomain,
  versionOf,
  type DnsAnswer
} from './ipQueryCore'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'

const ip = ref('')
const prefix = ref(24)
const domain = ref('')
const rrType = ref('A')
const provider = ref(DOH_PROVIDERS[0].id)

const myIp = ref('')
const echoErr = ref('')
const echoing = ref(false)
const dns = ref<DnsAnswer[]>([])
const dnsErr = ref('')
const dnsing = ref(false)

const { copy } = useToolActions()

const ver = computed(() => versionOf(ip.value.trim()))
const badIp = computed(() => ip.value.trim() !== '' && ver.value === null)
const nature = computed(() => (ver.value ? natureOf(ip.value.trim()) : 'unknown'))
const cidr = computed(() => (ver.value === 4 ? cidrInfo(ip.value.trim(), prefix.value) : null))
const badDomain = computed(() => domain.value.trim() !== '' && !validateDomain(domain.value))

async function fetchMyIp() {
  echoing.value = true
  echoErr.value = ''
  myIp.value = ''
  for (const ep of ECHO_ENDPOINTS) {
    try {
      const res = await fetch(ep.url, { cache: 'no-store' })
      if (!res.ok) continue
      const txt = (await res.text()).trim()
      const parsed = ep.kind === 'json' ? String((JSON.parse(txt) as { ip?: string }).ip ?? '') : txt
      if (parsed) {
        myIp.value = parsed
        echoing.value = false
        return
      }
    } catch {
      // 换下一个回显服务
    }
  }
  echoing.value = false
  echoErr.value = '所有回显服务均未响应，可能是网络受限或被浏览器拦截。'
}

async function resolve() {
  const name = domain.value.trim()
  if (!name || !validateDomain(name)) return
  dnsing.value = true
  dnsErr.value = ''
  dns.value = []
  const p = DOH_PROVIDERS.find((x) => x.id === provider.value) ?? DOH_PROVIDERS[0]
  try {
    const res = await fetch(buildDohUrl(p.url, name, rrType.value), {
      headers: { accept: 'application/dns-json' }
    })
    if (!res.ok) throw new Error(String(res.status))
    const list = normalizeDns(await res.json())
    if (!list.length) dnsErr.value = `未查询到 ${rrType.value} 记录。`
    dns.value = list
  } catch (e) {
    dnsErr.value = `解析失败：${p.name} 未响应（${e instanceof Error ? e.message : '网络错误'}）。可切换其他 DNS 服务商重试。`
  }
  dnsing.value = false
}

const ipSummary = computed(() => {
  if (!ver.value) return ''
  const t = ip.value.trim()
  const lines = [`地址：${t}`, `版本：IPv${ver.value}`, `性质：${NATURE_LABEL[nature.value]}`]
  if (ver.value === 4) {
    lines.push(`十进制：${ipv4ToDecimal(t)}`)
    lines.push(`二进制：${ipv4ToBinary(t)}`)
    if (cidr.value) {
      lines.push(`网段：${cidr.value.network}`)
      lines.push(`可用地址：${cidr.value.first} ~ ${cidr.value.last}（共 ${cidr.value.usable} 个）`)
    }
  }
  return lines.join('\n')
})
</script>

<template>
  <div class="tu-t1">
    <p class="tu-alert info">
      本机公网 IP 与域名解析需要发起网络请求；「归属地 / ASN」需服务端数据源，本工具不提供，也不会上传任何输入内容。
    </p>

    <div class="tu-toolbar">
      <button type="button" class="tu-btn" :disabled="echoing" @click="fetchMyIp">
        {{ echoing ? '获取中…' : '获取本机公网 IP' }}
      </button>
      <span v-if="myIp" class="ipq-myip">{{ myIp }}</span>
      <button v-if="myIp" type="button" class="tu-btn ghost" @click="copy(myIp)">复制</button>
      <button v-if="myIp" type="button" class="tu-btn ghost" @click="ip = myIp">填入下方分析</button>
    </div>
    <p v-if="echoErr" class="tu-alert">{{ echoErr }}</p>

    <TuField label="IP 地址分析" hint="支持 IPv4 / IPv6；自动判定私有、回环、保留、组播等性质">
      <input
        v-model="ip"
        type="text"
        class="tu-input"
        placeholder="例如：192.168.1.1 / 8.8.8.8 / 2408:8207:78cc::1"
        data-testid="tb-ipq-ip"
      />
    </TuField>

    <p v-if="badIp" class="tu-alert">不是合法的 IPv4 或 IPv6 地址。</p>

    <div v-if="ver" class="tu-grid">
      <div class="tu-card">
        <div class="tu-card-title">版本</div>
        <div class="tu-card-value">IPv{{ ver }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">性质</div>
        <div class="tu-card-value ipq-sm">{{ NATURE_LABEL[nature] }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">是否内网</div>
        <div class="tu-card-value">{{ isPrivateIp(ip.trim()) ? '是' : '否' }}</div>
      </div>
      <template v-if="ver === 4">
        <div class="tu-card">
          <div class="tu-card-title">十进制</div>
          <div class="tu-card-value ipq-sm">{{ ipv4ToDecimal(ip.trim()) }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">二进制</div>
          <div class="tu-card-value ipq-xs">{{ ipv4ToBinary(ip.trim()) }}</div>
        </div>
      </template>
    </div>

    <div v-if="ver === 4" class="tu-row">
      <label class="tu-label ipq-inline">前缀长度 /{{ prefix }}</label>
      <input v-model.number="prefix" type="range" class="tu-range ipq-range" min="0" max="32" />
    </div>
    <div v-if="cidr" class="tu-table-wrap">
      <table class="tu-table">
        <tbody>
          <tr><th>网段</th><td>{{ cidr.network }}</td></tr>
          <tr><th>广播地址</th><td>{{ cidr.broadcast }}</td></tr>
          <tr><th>可用范围</th><td>{{ cidr.first }} ~ {{ cidr.last }}</td></tr>
          <tr><th>可用主机数</th><td>{{ cidr.usable }}</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="ver" class="tu-row">
      <button type="button" class="tu-btn ghost" @click="copy(ipSummary)">复制分析结果</button>
    </div>

    <TuField label="域名解析（DoH）" hint="通过公共 DNS-over-HTTPS 服务商解析，可切换服务商">
      <div class="tu-row ipq-nomargin">
        <input
          v-model="domain"
          type="text"
          class="tu-input"
          placeholder="例如：example.com"
          data-testid="tb-ipq-domain"
        />
        <select v-model="rrType" class="tu-select">
          <option value="A">A</option>
          <option value="AAAA">AAAA</option>
          <option value="CNAME">CNAME</option>
          <option value="MX">MX</option>
          <option value="TXT">TXT</option>
          <option value="NS">NS</option>
        </select>
        <select v-model="provider" class="tu-select">
          <option v-for="p in DOH_PROVIDERS" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button type="button" class="tu-btn" :disabled="dnsing || !domain.trim() || badDomain" @click="resolve">
          {{ dnsing ? '解析中…' : '解析' }}
        </button>
      </div>
    </TuField>

    <p v-if="badDomain" class="tu-alert">域名格式不正确。</p>
    <p v-if="dnsErr" class="tu-alert">{{ dnsErr }}</p>

    <div v-if="dns.length" class="tu-table-wrap">
      <table class="tu-table">
        <thead>
          <tr><th>类型</th><th>记录值</th><th class="ipq-ttl">TTL</th></tr>
        </thead>
        <tbody>
          <tr v-for="(a, i) in dns" :key="i">
            <td>{{ a.type }}</td>
            <td>{{ a.value }}</td>
            <td class="ipq-ttl">{{ a.ttl }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ipq-myip { font-family: var(--font-family-mono); font-size: 14px; color: var(--color-text); }
.ipq-sm { font-size: 14px; }
.ipq-xs { font-size: 11.5px; line-height: 1.5; }
.ipq-inline { margin-bottom: 0; }
.ipq-range { width: 220px; }
.ipq-nomargin { margin-bottom: 0; }
.ipq-ttl { width: 72px; font-family: var(--font-family-mono); }
</style>
