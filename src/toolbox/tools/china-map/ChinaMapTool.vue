<script setup lang="ts">
/**
 * 中国地图（工具箱）
 * 展示我国 34 个省级行政区：各省独立配色 + 省名常显（小字 + 白描边）+ 省会标记，
 * 渤海/黄海/东海标注于大陆东岸，台湾省含于大陆主体（含钓鱼岛、赤尾屿）；南海诸岛
 * （九段线 + 南沙群岛 + 东沙/西沙/中沙群岛 + 曾母暗沙）以标准「右下角插图」形式呈现。
 *
 * 布局说明：单一 GeoJSON 含南海诸岛，其纬度跨度达 3.8°–53.6°（含海南三沙市），
 * 整体过高导致放大后黑龙江/南海被裁切。故采用标准中国地图做法：
 *   - 主图 geo 用 boundingCoords 锁定大陆主体窗口（纬度 17°–53.8°），黑龙江必现、不裁切；
 *   - 南海诸岛单独注册为 inset geo，置于右下角并加浅色边框，满足九段线/南沙群岛需求。
 *
 * 升级项：
 *   1) 标准地图来源标注（自然资源部），公开使用前需送审获取审图号；
 *   2) 补绘南海岛礁（东沙/西沙/中沙/南沙/曾母暗沙）；
 *   3) 国界线：由同一权威省界数据求并集得到「仅国界」轮廓，作为合成区域并入主图 geo
 *      （与省份同一坐标系，缩放/平移原生联动，无需事件同步）；
 *   4) 首都符号（北京★）+ 省份搜索 / 图例点击下钻；
 *   5) hover 提示 + 点击下钻（缩放至该省）；
 *   6) 比例尺（实时公里数）+「200km 视图」按钮（缩放至可视高度约 200 公里）。
 *
 * 数据随站打包 public/china-geo/100000_full.json，离线可用。
 * ECharts 走 echarts/core 树摇（仿 StudentGrades）：GeoComponent + ScatterChart + TooltipComponent + CanvasRenderer。
 */
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, ref } from 'vue'
import { init, registerMap, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { GeoComponent, TooltipComponent, GraphicComponent } from 'echarts/components'
import { ScatterChart } from 'echarts/charts'
import * as polygonClipping from 'polygon-clipping'

use([CanvasRenderer, GeoComponent, ScatterChart, TooltipComponent, GraphicComponent])

// polygon-clipping 为 CJS，Vite 互操作下可能挂在 default 上，做兼容兜底
const _pc: any = polygonClipping as any
const unionFn = (_pc.union ?? _pc.default?.union) as (...g: any[]) => any

const GEO_URL = 'china-geo/100000_full.json'

// 主图可视窗口（大陆主体，含海南本岛，舍去南海远域）
const MAIN_BOUNDS: [[number, number], [number, number]] = [[73, 17], [135.5, 53.8]]
const MAIN_LAT_SPAN_DEG = 53.8 - 17
const DEFAULT_CENTER: [number, number] = [(73 + 135.5) / 2, (17 + 53.8) / 2]
// 南海插图窗口（九段线 + 南海诸岛）
const NANHAI_BOUNDS: [[number, number], [number, number]] = [[106, 3.2], [123, 25]]
const INSET = { right: 12, bottom: 12, width: 150, height: 210 }

// 省份 → 省会
const CAPITAL: Record<string, string> = {
  '北京市': '北京', '天津市': '天津', '河北省': '石家庄', '山西省': '太原', '内蒙古自治区': '呼和浩特',
  '辽宁省': '沈阳', '吉林省': '长春', '黑龙江省': '哈尔滨', '上海市': '上海', '江苏省': '南京',
  '浙江省': '杭州', '安徽省': '合肥', '福建省': '福州', '江西省': '南昌', '山东省': '济南',
  '河南省': '郑州', '湖北省': '武汉', '湖南省': '长沙', '广东省': '广州', '广西壮族自治区': '南宁',
  '海南省': '海口', '重庆市': '重庆', '四川省': '成都', '贵州省': '贵阳', '云南省': '昆明',
  '西藏自治区': '拉萨', '陕西省': '西安', '甘肃省': '兰州', '青海省': '西宁', '宁夏回族自治区': '银川',
  '新疆维吾尔自治区': '乌鲁木齐', '台湾省': '台北', '香港特别行政区': '香港', '澳门特别行政区': '澳门'
}
// 直辖市 / 特别行政区：省会即自身，不重复画红点（但北京另以首都符号标出）
const NO_CAPITAL_DOT = new Set(['天津市', '上海市', '重庆市', '香港特别行政区', '澳门特别行政区'])
const shortName = (n: string) => n.replace(/(省|市|自治区|特别行政区)$/, '')
// 密集区省名偏移（经纬度，[dlng, dlat]）
const LABEL_OFFSET: Record<string, [number, number]> = {
  '北京市': [-1.3, 0.9], '天津市': [1.3, -0.7], '河北省': [0, -1.4],
  '上海市': [0.4, 0.5], '香港特别行政区': [0.6, 0.3], '澳门特别行政区': [-0.6, -0.5]
}
// 黄金角生成可区分色相
function palette(n: number): string[] {
  const arr: string[] = []
  for (let i = 0; i < n; i++) {
    const hue = (i * 137.508) % 360
    arr.push(`hsl(${hue.toFixed(1)}, 60%, 62%)`)
  }
  return arr
}

// 南海岛礁（插图内）
const REEFS: { name: string; value: [number, number] }[] = [
  { name: '东沙群岛', value: [116.7, 20.7] },
  { name: '西沙群岛', value: [112.0, 16.8] },
  { name: '中沙群岛', value: [114.3, 15.5] },
  { name: '南沙群岛', value: [114.6, 11.2] },
  { name: '曾母暗沙', value: [112.5, 4.0] }
]

type ChartInstance = ReturnType<typeof init>

const chartEl = ref<HTMLElement | null>(null)
const loadError = ref('')
const loading = ref(true)
const legend = ref<{ name: string; short: string; capital: string; color: string }[]>([])
const searchText = ref('')
const selected = ref('')
const scale = ref<{ distKm: number; barPx: number; heightKm: number }>({ distKm: 0, barPx: 0, heightKm: 0 })

let chart: ChartInstance | null = null
let ro: ResizeObserver | null = null
let pendingGeo: any = null // 已加载的 GeoJSON，待容器有尺寸后初始化图表
let initTries = 0 // 容器未挂载时延迟初始化的重试计数
let baseKmPerPx = 0 // 缩放 1 时每像素对应公里数（init 后测算）
const bboxMap: Record<string, [number, number, number, number]> = {} // 省名 → [lngMin,latMin,lngMax,latMax]

const filteredLegend = computed(() => {
  const q = searchText.value.trim()
  if (!q) return legend.value
  return legend.value.filter(p => p.short.includes(q) || p.name.includes(q))
})

async function loadGeo(): Promise<any> {
  const res = await fetch(GEO_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// —— 国界线：由同一省界数据求并集，得到「仅国界」轮廓（顶点同源，合规）——
// 道格拉斯-普克简化（降低顶点数，轮廓为视觉描边，不影响底层填充）
function distToSegSq(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const x = a[0] + t * dx, y = a[1] + t * dy
  return (p[0] - x) ** 2 + (p[1] - y) ** 2
}
function simplifyRing(pts: number[][], tol: number): number[][] {
  if (pts.length < 4) return pts
  const n = pts.length
  const keep = new Array(n).fill(false)
  keep[0] = true
  keep[n - 1] = true
  const stack: [number, number][] = [[0, n - 1]]
  const sq = tol * tol
  while (stack.length) {
    const [s, e] = stack.pop()!
    let maxD = -1, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = distToSegSq(pts[i], pts[s], pts[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > sq && idx !== -1) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  const out: number[][] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i])
  if (out.length < 2) return pts
  // 保持闭合
  const first = out[0], last = out[out.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]])
  return out
}
// 国界合成区域名（并入 china-main，与省份同一 geo 原生联动缩放；下划线开头避免与真实省名冲突）
const BORDER_REGION = '__national_border__'
const isBorderName = (n: string) => n.startsWith('__')
function buildBorderFeature(features: any[]): any | null {
  try {
    const tol = 0.1 // ≈ 11km
    const polys: any[] = []
    for (const f of features) {
      const g = f.geometry
      if (!g) continue
      const geoms = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]
      for (const poly of geoms) {
        const rings = (poly as number[][][]).map((ring: number[][]) => simplifyRing(ring, tol))
        if (rings.length && rings[0].length >= 4) polys.push([rings[0], ...rings.slice(1)])
      }
    }
    if (!polys.length) return null
    const geomCoords = polys.length === 1 ? polys[0] : unionFn(polys[0], ...polys.slice(1))
    if (!Array.isArray(geomCoords) || !geomCoords.length) return null
    // polygon-clipping union 直接返回坐标数组：单个 Polygon（深度3）需包成 MultiPolygon（深度4）
    const isPolygon = Array.isArray(geomCoords[0]) && Array.isArray(geomCoords[0][0]) && !Array.isArray(geomCoords[0][0][0])
    const coords = isPolygon ? [geomCoords] : geomCoords
    return {
      type: 'Feature',
      properties: { name: BORDER_REGION },
      geometry: { type: 'MultiPolygon', coordinates: coords as number[][][][] }
    }
  } catch (e) {
    console.warn('[china-map] 国界线并集计算失败，已跳过：', e)
    return null
  }
}

function buildOption(mainGeo: any) {
  const feats = (mainGeo.features as any[]).filter(f => f.properties && f.properties.name && !isBorderName(f.properties.name))
  const names = feats.map(f => f.properties.name as string)
  const colors = palette(names.length)
  legend.value = feats.map((f, i) => ({
    name: f.properties.name,
    short: shortName(f.properties.name),
    capital: NO_CAPITAL_DOT.has(f.properties.name) ? '' : (CAPITAL[f.properties.name] || ''),
    color: colors[i]
  }))
  // 省份包围盒（用于点击下钻）
  for (const f of feats) {
    const g = f.geometry
    const rings: number[][][] = g.type === 'MultiPolygon'
      ? (g.coordinates as number[][][][]).flatMap((p: number[][][]) => p)
      : (g.coordinates as number[][][])
    let lngMin = 180, latMin = 90, lngMax = -180, latMax = -90
    for (const ring of rings) for (const pt of ring) {
      if (pt[0] < lngMin) lngMin = pt[0]
      if (pt[0] > lngMax) lngMax = pt[0]
      if (pt[1] < latMin) latMin = pt[1]
      if (pt[1] > latMax) latMax = pt[1]
    }
    bboxMap[f.properties.name] = [lngMin, latMin, lngMax, latMax]
  }

  const bjFeat = feats.find(f => f.properties.name === '北京市')
  const bjCenter = ((bjFeat?.properties?.center || bjFeat?.properties?.centroid) || [116.4, 39.9]) as [number, number]

  const capitals = feats
    .filter(f => !NO_CAPITAL_DOT.has(f.properties.name))
    .map(f => ({
      name: CAPITAL[f.properties.name] || f.properties.name,
      value: ((f.properties.center || f.properties.centroid) || [0, 0]) as [number, number],
      prov: f.properties.name
    }))

  const provinceLabels = feats.map(f => {
    const c = (f.properties.centroid || f.properties.center) as [number, number]
    const off = LABEL_OFFSET[f.properties.name] || [0, 0]
    return { name: shortName(f.properties.name), value: [c[0] + off[0], c[1] + off[1]] as [number, number] }
  })

  const regions = names.map((name, i) => ({ name, itemStyle: { areaColor: colors[i] } }))
  // 国界线合成区域：透明填充 + 粗深外轮廓，置于省份之后（后绘制盖在上层），随主图原生缩放平移
  regions.push({
    name: BORDER_REGION,
    itemStyle: { areaColor: 'rgba(0,0,0,0)', borderColor: '#2b2f36', borderWidth: 1.8 },
    label: { show: false },
    emphasis: { itemStyle: { areaColor: 'rgba(0,0,0,0)' }, label: { show: false } },
    select: { disabled: true }
  } as any)

  const geos: any[] = [
    {
      // 主图：大陆主体（省界为细浅线；国界为并入的合成区域，见 regions 末项）
      map: 'china-main',
      roam: true,
      zoom: 1,
      center: DEFAULT_CENTER,
      boundingCoords: MAIN_BOUNDS,
      scaleLimit: { min: 0.8, max: 30 },
      label: { show: false },
      itemStyle: { areaColor: '#8a93a3', borderColor: '#7c8696', borderWidth: 0.6 },
      emphasis: { itemStyle: { areaColor: '#ffd666', shadowBlur: 8, shadowColor: 'rgba(0,0,0,.25)' }, label: { show: false } },
      regions
    },
    {
      // 插图：南海诸岛 / 九段线
      map: 'china-nanhai',
      roam: false,
      zoom: 1,
      boundingCoords: NANHAI_BOUNDS,
      left: 'auto', top: 'auto',
      right: INSET.right, bottom: INSET.bottom, width: INSET.width, height: INSET.height,
      z: 2,
      label: { show: false },
      itemStyle: { areaColor: 'rgba(138,147,163,.22)', borderColor: '#5b6472', borderWidth: 0.6 },
      emphasis: { disabled: true },
      tooltip: { show: false }
    }
  ]

  return {
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: any) => {
        if (isBorderName(p.name || '')) return ''
        if (p.seriesType === 'scatter') {
          if (p.seriesName === '首都') return `<b>首都 · ${p.name}</b>`
          if (p.data && p.data.prov) return `<b>${shortName(p.data.prov)}</b><br/>省会：${p.name}`
          return `<b>${p.name}</b>`
        }
        const cap = CAPITAL[p.name]
        return `<b>${shortName(p.name)}</b>${cap ? `<br/>省会：${cap}` : ''}`
      }
    },
    graphic: [
      // 南海插图浅色底框
      {
        type: 'rect',
        right: INSET.right, bottom: INSET.bottom, width: INSET.width, height: INSET.height,
        z: 1, silent: true,
        style: { fill: 'rgba(140,150,165,.10)', stroke: '#8893a3', lineWidth: 1 }
      }
    ],
    geo: geos,
    series: [
      {
        // 省会红点（直辖市/特区已省略，北京另以首都符号标出），主图
        name: '省会',
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 0, data: capitals, symbolSize: 5,
        itemStyle: { color: '#c0392b' },
        label: {
          show: true, formatter: '{b}', position: 'right',
          fontSize: 9, color: '#c0392b', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 2
        },
        emphasis: { scale: 1.6, label: { fontSize: 11, fontWeight: 'bold' } },
        labelLayout: { hideOverlap: true },
        zlevel: 3
      },
      {
        // 首都符号：北京 ★
        name: '首都',
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 0,
        data: [{ name: '北京', value: bjCenter }],
        symbol: 'star', symbolSize: 18, itemStyle: { color: '#d4380d', borderColor: '#fff', borderWidth: 1 },
        label: { show: true, formatter: '北京', position: 'right', fontSize: 10, fontWeight: 'bold', color: '#d4380d', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 2 },
        emphasis: { scale: 1.4 },
        zlevel: 7
      },
      {
        // 省名文字层（centroid 锚定 + 密集区偏移 + 自动隐藏重叠），主图
        name: '省名',
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 0, symbolSize: 0, silent: true, data: provinceLabels,
        label: {
          show: true, formatter: '{b}', position: 'center',
          fontSize: 10, color: '#1f2937', textBorderColor: 'rgba(255,255,255,.92)', textBorderWidth: 2
        },
        emphasis: { label: { fontSize: 12, fontWeight: 'bold', color: '#111' } },
        labelLayout: { hideOverlap: true },
        zlevel: 5
      },
      {
        // 渤海 / 黄海 / 东海（大陆东岸海域），主图
        name: '海域',
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 0, symbolSize: 0, silent: true,
        data: [
          { name: '渤海', value: [119.9, 39.3], label: { color: '#1f5f8b', fontSize: 13, fontWeight: 'bold' } },
          { name: '黄海', value: [122.6, 36.0], label: { color: '#1f5f8b', fontSize: 13, fontWeight: 'bold' } },
          { name: '东海', value: [123.2, 28.4], label: { color: '#1f5f8b', fontSize: 13, fontWeight: 'bold' } }
        ],
        label: { show: true, formatter: '{b}', position: 'bottom', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 2 },
        zlevel: 4
      },
      {
        // 南海岛礁（东沙/西沙/中沙/南沙/曾母暗沙），插图
        name: '岛礁',
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 1, symbol: 'diamond', symbolSize: 6,
        data: REEFS.map(r => ({ name: r.name, value: r.value })),
        itemStyle: { color: '#b45309', borderColor: '#fff', borderWidth: 0.5 },
        label: { show: true, formatter: '{b}', position: 'right', fontSize: 8, color: '#b45309', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 1.5 },
        labelLayout: { hideOverlap: true },
        zlevel: 6
      },
      {
        // 南海诸岛标题，插图
        name: '南海',
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 1, symbolSize: 0, silent: true,
        data: [{ name: '南海诸岛', value: [114.8, 23.5], label: { color: '#1f5f8b', fontSize: 11, fontWeight: 'bold' } }],
        label: { show: true, formatter: '{b}', position: 'bottom', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 2 },
        zlevel: 6
      }
    ]
  }
}

function niceRound(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const f = v / base
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  return nice * base
}

function ensureBase() {
  if (!chart || baseKmPerPx > 0) return
  try {
    const p1 = chart.convertToPixel({ geoIndex: 0 }, [104, 30]) as number[]
    const p2 = chart.convertToPixel({ geoIndex: 0 }, [104, 31]) as number[]
    if (p1 && p2) {
      const dy = Math.abs(p2[1] - p1[1])
      if (dy > 0) baseKmPerPx = 111.32 / dy
    }
  } catch { /* noop */ }
}

function updateScale() {
  if (!chart || !chartEl.value) return
  ensureBase()
  if (baseKmPerPx <= 0) return
  const g = (chart.getOption().geo as any[])[0]
  const zoom = g.zoom || 1
  const kmPerPx = baseKmPerPx / zoom
  const H = chartEl.value.clientHeight || 1
  const heightKm = kmPerPx * H
  const distKm = niceRound(90 * kmPerPx)
  const barPx = distKm / kmPerPx
  scale.value = { distKm, barPx, heightKm }
}

function applyView(lng: number, lat: number, zoom: number) {
  if (!chart) return
  const center: [number, number] = [lng, lat]
  // 国界轮廓并入主图 geo（合成区域），只需驱动 geo[0]，无联动同步
  chart.setOption({ geo: [{ center, zoom }] })
  updateScale()
}

function drillTo(name: string) {
  const b = bboxMap[name]
  if (!b) return
  const [lngMin, latMin, lngMax, latMax] = b
  const cLat = (latMin + latMax) / 2
  const cLng = (lngMin + lngMax) / 2
  const provLat = latMax - latMin
  let z = MAIN_LAT_SPAN_DEG / (provLat * 1.15)
  z = Math.min(30, Math.max(1.3, z))
  selected.value = name
  applyView(cLng, cLat, z)
}

function resetView() {
  selected.value = ''
  applyView(DEFAULT_CENTER[0], DEFAULT_CENTER[1], 1)
}

function zoomTo200() {
  if (!chart || !chartEl.value) return
  ensureBase()
  if (baseKmPerPx <= 0) return
  const H = chartEl.value.clientHeight || 1
  const baseHeightKm = baseKmPerPx * H // 缩放 1 时可视高度
  const z = Math.min(30, Math.max(1, baseHeightKm / 200))
  selected.value = ''
  applyView(DEFAULT_CENTER[0], DEFAULT_CENTER[1], z)
}

function formatKm(v: number): string {
  return Math.round(v).toLocaleString() + ' km'
}

// 安全网：渲染/生命周期中若仍有异常（如 ECharts 与 Vue 树互写 DOM），
// 就地展示具体错误而非让外层弹框以「工具加载失败」整体降级。
onErrorCaptured((err: unknown) => {
  loadError.value = '地图渲染异常：' + (err instanceof Error ? err.message : String(err))
  loading.value = false
  return false
})

function buildChart() {
  if (chart || !chartEl.value || !pendingGeo) return
  const el = chartEl.value
  // 容器必须已挂入文档：弹框/Suspense 布局时序可能让 chartEl 暂未 connected，
  // 此时 zrender 在脱离文档的节点上 patch 会报 insertBefore null。延后到下一帧再试。
  if (!el.isConnected) {
    if (initTries++ < 120) requestAnimationFrame(() => buildChart())
    return
  }
  initTries = 0
  // 容器可能尚未布局（弹窗/标签页未展开）而尺寸为 0；以非零兜底尺寸初始化，
  // 避免 ECharts（canvas）在 0 尺寸 + boundingCoords 下渲染崩溃（insertBefore null）。
  const w = Math.max(320, el.clientWidth || 960)
  const h = Math.max(320, el.clientHeight || 640)
  try {
    const geo = pendingGeo
    const provinces = geo.features.filter((f: any) => f.properties && f.properties.name)
    const borderFeat = buildBorderFeature(provinces)
    const mainGeo = {
      type: 'FeatureCollection',
      // 国界并集轮廓作为最后一个 feature 并入主图（后绘制盖在上层），与省份同 geo 原生缩放平移
      features: borderFeat ? [...provinces, borderFeat] : provinces
    }
    const nanhaiGeo = {
      type: 'FeatureCollection',
      features: geo.features.filter((f: any) => f.properties && f.properties.adchar === 'JD')
    }
    registerMap('china-main', mainGeo as any)
    registerMap('china-nanhai', nanhaiGeo as any)
    chart = init(el, undefined, { renderer: 'canvas', width: w, height: h })
    chart.setOption(buildOption(mainGeo))
    loading.value = false
    requestAnimationFrame(() => { ensureBase(); updateScale() })
    chart.on('georoam', () => { updateScale() })
    chart.on('click', (p: any) => {
      if (p.data && p.data.prov) { drillTo(p.data.prov); return }
      if (p.componentType === 'geo' && p.name && !isBorderName(p.name) && CAPITAL[p.name] !== undefined) drillTo(p.name)
    })
  } catch (e) {
    loadError.value = '地图初始化失败：' + (e instanceof Error ? e.message : String(e))
    loading.value = false
  }
}

onMounted(async () => {
  try {
    pendingGeo = await loadGeo()
  } catch (e) {
    loadError.value = '地图数据加载失败：' + (e instanceof Error ? e.message : String(e))
    loading.value = false
    return
  }
  if (!chartEl.value) return
  // 容器尺寸就绪（或变为非零）时再初始化；尺寸变化则同步 resize
  ro = new ResizeObserver(() => {
    if (!chart) buildChart()
    else { chart.resize(); updateScale() }
  })
  ro.observe(chartEl.value)
  buildChart()
})

onBeforeUnmount(() => {
  ro && ro.disconnect()
  chart && chart.dispose()
  chart = null
})
</script>

<template>
  <div class="tu-china-map">
    <div class="map-toolbar">
      <input v-model="searchText" class="tu-input map-search" type="text" placeholder="搜索省份 / 直辖市…" />
      <button class="tu-btn ghost" @click="resetView">返回全国</button>
      <button class="tu-btn ghost" @click="zoomTo200">200km 视图</button>
    </div>

    <div class="map-box">
      <!-- ECharts 专用容器：保持无 Vue 子节点，避免与 ECharts(zrender) 互相改写 DOM 导致 insertBefore null -->
      <div ref="chartEl" class="tu-canvas-box"></div>

      <div v-if="loadError" class="tu-alert map-error">{{ loadError }}</div>
      <div v-else-if="loading" class="tu-alert map-error info">地图加载中…</div>

      <div v-if="scale.barPx" class="scale-box">
        <div class="scale-bar"><span class="scale-fill" :style="{ width: scale.barPx + 'px' }"></span></div>
        <div class="scale-text">
          比例尺 ≈ {{ formatKm(scale.distKm) }} · 当前视图高度 ≈ {{ formatKm(scale.heightKm) }}
        </div>
      </div>
    </div>

    <aside class="legend">
      <h3 class="legend-title">省份 · 省会</h3>
      <ul class="legend-list">
        <li
          v-for="p in filteredLegend"
          :key="p.name"
          :class="{ active: selected === p.name }"
          :title="p.name"
          @click="drillTo(p.name)"
        >
          <span class="sw" :style="{ background: p.color }"></span>
          <span class="nm">{{ p.short }}</span>
          <span v-if="p.capital" class="cap">{{ p.capital }}</span>
        </li>
      </ul>
      <p class="legend-note">右下角为南海诸岛（九段线）插图；点击省份或图例可下钻缩放。</p>
      <p class="legend-note src">
        标准地图来源：自然资源部（bzdt.ch.mnr.gov.cn）。本图为依标准地图自绘的示意交互图，
        公开使用前请按《地图管理条例》送审获取审图号。
      </p>
    </aside>
  </div>
</template>

<style scoped>
.tu-china-map { position: relative; display: flex; flex-direction: column; gap: 10px; height: 100%; }
.map-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.map-search { width: auto; min-width: 220px; flex: 0 1 260px; }
.map-box { flex: 1 1 auto; min-height: 640px; position: relative; }
.tu-canvas-box { position: absolute; inset: 0; width: 100%; height: 100%; }
.legend {
  flex: 0 0 auto;
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
  max-height: 230px; overflow: auto;
}
.legend-title { font-size: 13px; color: var(--color-text-secondary); margin: 0 0 8px; }
.legend-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 2px 10px; }
.legend-list li { display: flex; align-items: center; gap: 7px; font-size: 12px; padding: 3px 4px; color: var(--color-text); border-radius: var(--radius-sm); cursor: pointer; }
.legend-list li:hover { background: var(--color-primary-soft); }
.legend-list li.active { background: var(--color-primary-soft); outline: 1px solid var(--color-primary); }
.legend-list .sw { width: 13px; height: 13px; border-radius: 3px; flex: 0 0 auto; border: 1px solid var(--color-border); }
.legend-list .cap { color: var(--color-primary); font-weight: 600; }
.legend-note { font-size: 11px; color: var(--color-text-secondary); margin: 10px 0 0; line-height: 1.5; }
.legend-note.src { color: var(--color-text-muted); }

.scale-box {
  position: absolute; left: 14px; bottom: 14px; z-index: 6;
  background: rgba(255, 255, 255, .82);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 6px 8px; pointer-events: none;
}
:global(html.dark) .scale-box { background: rgba(20, 24, 31, .82); }
.scale-bar { height: 8px; display: flex; align-items: center; }
.scale-fill {
  display: block; height: 6px;
  border-left: 2px solid #2b2f36; border-right: 2px solid #2b2f36;
  border-top: 2px solid #2b2f36; background: rgba(43, 47, 54, .12);
}
.scale-text { font-size: 11px; color: var(--color-text); margin-top: 4px; white-space: nowrap; }

.map-error { position: absolute; inset: 0; margin: auto; height: fit-content; width: fit-content; max-width: 80%; }
@media (min-width: 1100px) {
  .tu-china-map { flex-direction: row; align-items: stretch; }
  .map-toolbar { position: absolute; top: 10px; left: 12px; z-index: 6; flex-wrap: nowrap; }
  .map-box { min-height: 620px; }
  .legend { flex: 0 0 210px; max-height: 78vh; border-top: none; border-left: 1px solid var(--color-border); padding-top: 0; padding-left: 12px; }
  .legend-list { grid-template-columns: 1fr; }
}
</style>
