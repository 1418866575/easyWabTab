/**
 * 浏览器环境检测纯逻辑（UA 解析 + 报告构建 / 导出，采集动作在组件里完成）
 */

export interface UaInfo {
  browser: string
  version: string
  os: string
  engine: string
}

export function parseUserAgent(ua: string): UaInfo {
  const s = (ua ?? '')
  let browser = '未知浏览器'
  let version = ''
  let engine = '未知内核'

  const pick = (re: RegExp): string | null => {
    const m = re.exec(s)
    return m ? m[1] : null
  }

  // 顺序即优先级：套壳浏览器先于 Chrome 判定
  if (s.includes('Edg/')) {
    browser = 'Microsoft Edge'
    version = pick(/Edg\/([\d.]+)/) ?? ''
  } else if (s.includes('OPR/') || s.includes('Opera')) {
    browser = 'Opera'
    version = pick(/(?:OPR|Opera)[/ ]([\d.]+)/) ?? ''
  } else if (s.includes('Firefox/')) {
    browser = 'Firefox'
    version = pick(/Firefox\/([\d.]+)/) ?? ''
  } else if (s.includes('Chrome/')) {
    browser = 'Chrome'
    version = pick(/Chrome\/([\d.]+)/) ?? ''
  } else if (s.includes('Safari/')) {
    browser = 'Safari'
    version = pick(/Version\/([\d.]+)/) ?? ''
  } else if (s.includes('MSIE') || s.includes('Trident/')) {
    browser = 'Internet Explorer'
    version = pick(/(?:MSIE |rv:)([\d.]+)/) ?? ''
  }

  if (s.includes('Gecko/') && !s.includes('like Gecko') && s.includes('Firefox')) engine = 'Gecko'
  else if (s.includes('AppleWebKit/')) engine = s.includes('Chrome') || s.includes('Edg') || s.includes('OPR') ? 'Blink' : 'WebKit'
  else if (s.includes('Trident/')) engine = 'Trident'

  let os = '未知系统'
  if (/Windows NT 10\.0/.test(s)) os = 'Windows 10 / 11'
  else if (/Windows NT 6\.3/.test(s)) os = 'Windows 8.1'
  else if (/Windows NT 6\.1/.test(s)) os = 'Windows 7'
  else if (/Windows/.test(s)) os = 'Windows'
  else if (/Mac OS X ([\d_]+)/.test(s)) os = `macOS ${(pick(/Mac OS X ([\d_]+)/) ?? '').replace(/_/g, '.')}`
  else if (/Android ([\d.]+)/.test(s)) os = `Android ${pick(/Android ([\d.]+)/)}`
  else if (/iPhone|iPad|iPod/.test(s)) os = `iOS ${pick(/OS ([\d_]+)/)?.replace(/_/g, '.') ?? ''}`
  else if (/Linux/.test(s)) os = 'Linux'

  return { browser, version, os, engine }
}

export interface EnvInput {
  ua: string
  language: string
  languages: string
  platform: string
  userAgentData?: string | null
  cpuCores: number | null
  deviceMemory: number | null
  touchPoints: number
  cookiesEnabled: boolean
  online: boolean
  dpr: number
  screen: string
  viewport: string
  colorDepth: number
  timezone: string
  connection: string | null
  storageQuota: string | null
  storageUsage: string | null
  webglRenderer: string | null
  doNotTrack: string
}

export interface EnvFeature {
  name: string
  ok: boolean
}

export interface EnvReport {
  ua: UaInfo
  rawUa: string
  rows: { group: string; items: { k: string; v: string }[] }[]
  features: EnvFeature[]
}

export function buildReport(input: EnvInput, features: EnvFeature[]): EnvReport {
  const ua = parseUserAgent(input.ua)
  const rows = [
    {
      group: '浏览器与系统',
      items: [
        { k: '浏览器', v: `${ua.browser} ${ua.version}` },
        { k: '内核', v: ua.engine },
        { k: '操作系统', v: ua.os },
        { k: 'UA-CH 平台', v: input.userAgentData ?? input.platform ?? '—' }
      ]
    },
    {
      group: '语言与时区',
      items: [
        { k: '主语言', v: input.language || '—' },
        { k: '语言列表', v: input.languages || '—' },
        { k: '时区', v: input.timezone || '—' }
      ]
    },
    {
      group: '屏幕与视口',
      items: [
        { k: '屏幕分辨率', v: input.screen },
        { k: '视口大小', v: input.viewport },
        { k: '设备像素比', v: String(input.dpr) },
        { k: '色彩深度', v: `${input.colorDepth} bit` }
      ]
    },
    {
      group: '硬件与网络',
      items: [
        { k: 'CPU 逻辑核数', v: input.cpuCores === null ? '不支持' : String(input.cpuCores) },
        { k: '设备内存', v: input.deviceMemory === null ? '不支持' : `≥ ${input.deviceMemory} GB` },
        { k: '触控点数', v: String(input.touchPoints) },
        { k: '网络状态', v: input.online ? '在线' : '离线' },
        { k: '网络信息', v: input.connection ?? '不支持' },
        { k: 'Do Not Track', v: input.doNotTrack || '未设置' },
        { k: 'Cookie', v: input.cookiesEnabled ? '已启用' : '已禁用' }
      ]
    },
    {
      group: '存储与图形',
      items: [
        { k: '存储配额', v: input.storageQuota ?? '不支持' },
        { k: '已用存储', v: input.storageUsage ?? '不支持' },
        { k: 'WebGL 渲染器', v: input.webglRenderer ?? '不支持' }
      ]
    }
  ]
  return { ua, rawUa: input.ua, rows, features }
}

/** 能力检测清单（在浏览器里求值，纯函数只负责展示） */
export function detectFeatures(): EnvFeature[] {
  const nav = navigator as Navigator & { wakeLock?: unknown; connection?: unknown }
  const checks: [string, boolean][] = [
    ['剪贴板 API', !!nav.clipboard],
    ['WebRTC', typeof RTCPeerConnection !== 'undefined'],
    ['Wake Lock', !!nav.wakeLock],
    ['桌面通知', typeof Notification !== 'undefined'],
    ['WebCrypto', typeof crypto !== 'undefined' && !!crypto.subtle],
    ['IndexedDB', typeof indexedDB !== 'undefined'],
    ['Service Worker', 'serviceWorker' in navigator],
    ['WebAssembly', typeof WebAssembly !== 'undefined'],
    ['WebGL', (() => {
      try {
        const c = document.createElement('canvas')
        return !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
      } catch {
        return false
      }
    })()],
    ['Web Audio', typeof (window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) !== 'undefined'],
    ['语音合成', typeof speechSynthesis !== 'undefined'],
    ['语音识别', !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)],
    ['屏幕全屏', !!document.documentElement.requestFullscreen],
    ['屏幕常亮', !!nav.wakeLock],
    ['传感器（陀螺仪）', typeof DeviceOrientationEvent !== 'undefined'],
    ['文件系统访问', 'showOpenFilePicker' in window],
    ['共享 API', !!nav.share],
    ['触摸支持', 'ontouchstart' in window || nav.maxTouchPoints > 0]
  ]
  return checks.map(([name, ok]) => ({ name, ok }))
}

export function reportToText(r: EnvReport): string {
  const lines: string[] = ['=== 浏览器环境报告 ===']
  for (const g of r.rows) {
    lines.push(`[${g.group}]`)
    for (const it of g.items) lines.push(`${it.k}: ${it.v}`)
  }
  lines.push('[能力检测]')
  for (const f of r.features) lines.push(`${f.name}: ${f.ok ? '支持' : '不支持'}`)
  lines.push(`原始 UA: ${r.rawUa}`)
  return lines.join('\n')
}

export function reportToJson(r: EnvReport): string {
  return JSON.stringify(
    {
      browser: r.ua,
      groups: r.rows,
      features: r.features,
      rawUa: r.rawUa
    },
    null,
    2
  )
}
