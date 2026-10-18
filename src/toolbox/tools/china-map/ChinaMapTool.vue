<script setup lang="ts">
/**
 * 中国地图（工具箱）
 * 展示我国 34 个省级行政区：各省独立配色 + 省名常显（小字 + 白描边）+ 省会标记，
 * 渤海/黄海/东海标注于大陆东岸，台湾省含于大陆主体；南海诸岛（九段线 + 南沙群岛）
 * 以标准「右下角插图」形式呈现。
 *
 * 布局说明：单一 GeoJSON 含南海诸岛，其纬度跨度达 3.8°–53.6°（含海南三沙市），
 * 整体过高导致放大后黑龙江/南海被裁切。故采用标准中国地图做法：
 *   - 主图 geo 用 boundingCoords 锁定大陆主体窗口（纬度 17°–53.8°），黑龙江必现、不裁切；
 *   - 南海诸岛单独注册为 inset geo，置于右下角并加浅色边框，满足九段线/南沙群岛需求。
 * 数据随站打包 public/china-geo/100000_full.json，离线可用。
 * ECharts 走 echarts/core 树摇（仿 StudentGrades）：GeoComponent + ScatterChart + TooltipComponent + CanvasRenderer。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { init, registerMap, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { GeoComponent, TooltipComponent } from 'echarts/components'
import { ScatterChart } from 'echarts/charts'

use([CanvasRenderer, GeoComponent, ScatterChart, TooltipComponent])

const GEO_URL = 'china-geo/100000_full.json'

// 主图可视窗口（大陆主体，含海南本岛，舍去南海远域）
const MAIN_BOUNDS: [[number, number], [number, number]] = [[73, 17], [135.5, 53.8]]
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
// 直辖市 / 特别行政区：省会即自身，不重复画红点
const NO_CAPITAL = new Set(['北京市', '天津市', '上海市', '重庆市', '香港特别行政区', '澳门特别行政区'])
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

type ChartInstance = ReturnType<typeof init>

const chartEl = ref<HTMLElement | null>(null)
const loadError = ref('')
const legend = ref<{ name: string; short: string; capital: string; color: string }[]>([])
let chart: ChartInstance | null = null
let ro: ResizeObserver | null = null

async function loadGeo(): Promise<any> {
  const res = await fetch(GEO_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function buildOption(mainGeo: any) {
  const feats = (mainGeo.features as any[]).filter(f => f.properties && f.properties.name)
  const names = feats.map(f => f.properties.name as string)
  const colors = palette(names.length)
  legend.value = feats.map((f, i) => ({
    name: f.properties.name,
    short: shortName(f.properties.name),
    capital: NO_CAPITAL.has(f.properties.name) ? '' : (CAPITAL[f.properties.name] || ''),
    color: colors[i]
  }))

  const capitals = feats
    .filter(f => !NO_CAPITAL.has(f.properties.name))
    .map(f => ({
      name: CAPITAL[f.properties.name] || f.properties.name,
      value: (f.properties.center || f.properties.centroid) as [number, number],
      prov: f.properties.name
    }))

  const provinceLabels = feats.map(f => {
    const c = (f.properties.centroid || f.properties.center) as [number, number]
    const off = LABEL_OFFSET[f.properties.name] || [0, 0]
    return { name: shortName(f.properties.name), value: [c[0] + off[0], c[1] + off[1]] as [number, number] }
  })

  const regions = names.map((name, i) => ({ name, itemStyle: { areaColor: colors[i] } }))

  return {
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: any) => p.seriesType === 'scatter'
        ? `<b>${p.data.prov || p.name}</b>`
        : `<b>${p.name}</b>`
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
    geo: [
      {
        // 主图：大陆主体
        map: 'china-main',
        roam: true,
        zoom: 1,
        boundingCoords: MAIN_BOUNDS,
        scaleLimit: { min: 0.8, max: 8 },
        label: { show: false },
        itemStyle: { areaColor: '#8a93a3', borderColor: '#5b6472', borderWidth: 0.6 },
        emphasis: { itemStyle: { areaColor: '#ffd666', shadowBlur: 8, shadowColor: 'rgba(0,0,0,.25)' } },
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
    ],
    series: [
      {
        // 省会红点（直辖市/特区已省略），主图
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 0, data: capitals, symbolSize: 5,
        itemStyle: { color: '#c0392b' },
        label: {
          show: true, formatter: '{b}', position: 'right',
          fontSize: 8, color: '#c0392b', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 2
        },
        emphasis: { scale: 1.6, label: { fontSize: 10, fontWeight: 'bold' } },
        labelLayout: { hideOverlap: true },
        zlevel: 3
      },
      {
        // 省名文字层（centroid 锚定 + 密集区偏移 + 自动隐藏重叠），主图
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 0, symbolSize: 0, silent: true, data: provinceLabels,
        label: {
          show: true, formatter: '{b}', position: 'center',
          fontSize: 9, color: '#1f2937', textBorderColor: 'rgba(255,255,255,.92)', textBorderWidth: 2
        },
        emphasis: { label: { fontSize: 11, fontWeight: 'bold', color: '#111' } },
        labelLayout: { hideOverlap: true },
        zlevel: 5
      },
      {
        // 渤海 / 黄海 / 东海（大陆东岸海域），主图
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 0, symbolSize: 0, silent: true,
        data: [
          { name: '渤海', value: [119.9, 39.3], label: { color: '#1f5f8b', fontSize: 12, fontWeight: 'bold' } },
          { name: '黄海', value: [122.6, 36.0], label: { color: '#1f5f8b', fontSize: 12, fontWeight: 'bold' } },
          { name: '东海', value: [123.2, 28.4], label: { color: '#1f5f8b', fontSize: 12, fontWeight: 'bold' } }
        ],
        label: { show: true, formatter: '{b}', position: 'bottom', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 2 },
        zlevel: 4
      },
      {
        // 南海诸岛标题 + 南沙群岛标注，插图
        type: 'scatter', coordinateSystem: 'geo', geoIndex: 1, symbolSize: 0, silent: true,
        data: [
          { name: '南海诸岛', value: [114.8, 23.5], label: { color: '#1f5f8b', fontSize: 10, fontWeight: 'bold' } },
          { name: '南沙群岛', value: [114.6, 11.2], label: { color: '#b45309', fontSize: 9 } }
        ],
        label: { show: true, formatter: '{b}', position: 'bottom', textBorderColor: 'rgba(255,255,255,.9)', textBorderWidth: 2 },
        zlevel: 6
      }
    ]
  }
}

onMounted(async () => {
  if (!chartEl.value) return
  try {
    const geo = await loadGeo()
    const mainGeo = {
      type: 'FeatureCollection',
      features: geo.features.filter((f: any) => f.properties && f.properties.name)
    }
    const nanhaiGeo = {
      type: 'FeatureCollection',
      features: geo.features.filter((f: any) => f.properties && f.properties.adchar === 'JD')
    }
    registerMap('china-main', mainGeo as any)
    registerMap('china-nanhai', nanhaiGeo as any)
    chart = init(chartEl.value, undefined, { renderer: 'canvas' })
    chart.setOption(buildOption(mainGeo))
    ro = new ResizeObserver(() => chart && chart.resize())
    ro.observe(chartEl.value)
  } catch (e) {
    loadError.value = '地图数据加载失败：' + (e instanceof Error ? e.message : String(e))
  }
})

onBeforeUnmount(() => {
  ro && ro.disconnect()
  chart && chart.dispose()
  chart = null
})
</script>

<template>
  <div class="tu-china-map">
    <div ref="chartEl" class="map-box tu-canvas-box">
      <div v-if="loadError" class="tu-alert map-error">{{ loadError }}</div>
    </div>
    <aside class="legend">
      <h3 class="legend-title">省份 · 省会</h3>
      <ul class="legend-list">
        <li v-for="p in legend" :key="p.name">
          <span class="sw" :style="{ background: p.color }"></span>
          <span class="nm">{{ p.short }}</span>
          <span v-if="p.capital" class="cap">{{ p.capital }}</span>
        </li>
      </ul>
      <p class="legend-note">右下角为南海诸岛（九段线）插图</p>
    </aside>
  </div>
</template>

<style scoped>
.tu-china-map { display: flex; gap: 12px; align-items: stretch; height: 100%; }
.map-box { flex: 1 1 auto; min-height: 600px; position: relative; }
.legend {
  flex: 0 0 190px; max-height: 72vh; overflow: auto;
  border-left: 1px solid var(--color-border); padding-left: 12px;
}
.legend-title { font-size: 13px; color: var(--color-text-secondary); margin: 0 0 8px; }
.legend-list { list-style: none; margin: 0; padding: 0; }
.legend-list li { display: flex; align-items: center; gap: 7px; font-size: 12px; padding: 3px 0; color: var(--color-text); }
.legend-list .sw { width: 13px; height: 13px; border-radius: 3px; flex: 0 0 auto; border: 1px solid var(--color-border); }
.legend-list .cap { color: var(--color-primary); font-weight: 600; }
.legend-note { font-size: 11px; color: var(--color-text-secondary); margin: 10px 0 0; line-height: 1.5; }
.map-error { position: absolute; inset: 0; margin: auto; height: fit-content; width: fit-content; max-width: 80%; }
@media (max-width: 768px) {
  .tu-china-map { flex-direction: column; }
  .map-box { min-height: 460px; }
  .legend { flex-basis: auto; border-left: none; border-top: 1px solid var(--color-border); padding-left: 0; padding-top: 8px; max-height: 200px; }
}
</style>
