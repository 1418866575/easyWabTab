<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

const wsUrl = ref('')
const message = ref('')
const status = ref<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')
const logs = ref<{ dir: 'send' | 'recv' | 'sys'; text: string; ts: number }[]>([])
let ws: WebSocket | null = null

function log(dir: 'send' | 'recv' | 'sys', text: string) {
  logs.value.push({ dir, text, ts: Date.now() })
}
function connect() {
  if (!wsUrl.value) return
  status.value = 'connecting'
  log('sys', '连接 ' + wsUrl.value)
  try {
    ws = new WebSocket(wsUrl.value)
  } catch (e) {
    status.value = 'error'
    log('sys', '创建失败：' + (e as Error).message)
    return
  }
  ws.onopen = () => { status.value = 'open'; log('sys', '已连接') }
  ws.onmessage = (ev) => { log('recv', String(ev.data)) }
  ws.onerror = () => { status.value = 'error'; log('sys', '连接错误（详见浏览器控制台）') }
  ws.onclose = () => { status.value = 'closed'; log('sys', '已关闭') }
}
function sendMsg() {
  if (!ws || ws.readyState !== WebSocket.OPEN) { log('sys', '未连接，无法发送'); return }
  if (!message.value) return
  ws.send(message.value)
  log('send', message.value)
}
function closeConn() {
  if (ws) { ws.close(); ws = null }
  status.value = 'closed'
}
function clearLog() { logs.value = [] }
onBeforeUnmount(closeConn)
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field"><label class="tu-label">WebSocket 地址（ws:// 或 wss://）</label><input v-model="wsUrl" class="tu-input" placeholder="wss://echo.websocket.org" /></div>
      <div class="tu-field"><label class="tu-label">发送消息</label><input v-model="message" class="tu-input" @keyup.enter="sendMsg" placeholder="输入要发送的文本，回车发送" /></div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="status === 'open' || status === 'connecting'" @click="connect">连接</button>
        <button class="tu-btn ghost" :disabled="status !== 'open'" @click="sendMsg">发送</button>
        <button class="tu-btn ghost" :disabled="status !== 'open' && status !== 'connecting'" @click="closeConn">断开</button>
        <button class="tu-btn ghost" @click="clearLog">清空日志</button>
      </div>
      <p class="tu-hint">状态：<b>{{ status }}</b>。仅本地连接，不经过本站服务器。</p>
    </div>
    <div>
      <label class="tu-label">实时日志</label>
      <div class="tu-out" style="max-height:360px">
        <div v-for="(l, i) in logs" :key="i" style="white-space:pre-wrap;word-break:break-all">
          <span class="tu-tree-type">{{ new Date(l.ts).toLocaleTimeString() }}</span>
          <span v-if="l.dir === 'send'" style="color:var(--color-primary)">▶ 发送</span>
          <span v-else-if="l.dir === 'recv'" style="color:var(--color-success)">◀ 接收</span>
          <span v-else style="color:var(--color-text-muted)">· 系统</span>
          {{ ' ' + l.text }}
        </div>
        <div v-if="!logs.length" style="color:var(--color-text-muted)">暂无日志</div>
      </div>
    </div>
  </div>
</template>
