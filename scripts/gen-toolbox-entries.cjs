// 一次性生成/更新 src/toolbox/tools/<id>/index.ts（工具元数据入口）
// 运行：node scripts/gen-toolbox-entries.cjs
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'src', 'toolbox', 'tools')

// id, 组件文件名, 名称, 图标, 描述, 分类, 标签, order, 尺寸, 布局
const TOOLS = [
  ['json-format', 'JsonFormatTool', 'JSON 格式化', '🧩', 'JSON 美化、压缩、校验、键排序与树形浏览，精确定位语法错误', 'dev', ['json', '格式化', '校验', '树形'], 1, 'L', 'T2'],
  ['config-convert', 'ConfigConvertTool', 'JSON / YAML / TOML 互转', '🔀', '三种配置格式在线互转，自动检测源格式并校验语法', 'dev', ['yaml', 'toml', 'json', '配置'], 2, 'L', 'T2'],
  ['regex-test', 'RegexTestTool', '正则表达式测试', '🔍', '实时匹配、捕获组分析、替换预览与灾难性回溯防护', 'dev', ['正则', 'regex', '调试'], 3, 'L', 'T3'],
  ['jwt-decode', 'JwtDecodeTool', 'JWT 解析与验证', '🎫', '解码 Header/Payload、检查过期时间并校验 HS256/384/512 签名', 'dev', ['jwt', 'token', '验签'], 4, 'M', 'T1'],
  ['cron-parser', 'CronParserTool', 'Cron 表达式解析', '⏰', '解析 Cron 字段、生成中文描述与后续执行时间', 'dev', ['cron', '定时任务', '调度'], 5, 'M', 'T1'],
  ['base-convert', 'BaseConvertTool', '进制转换', '🔢', '2–36 进制互转，BigInt 保证大数精度，支持分组与多进制一览', 'dev', ['进制', '二进制', '十六进制'], 6, 'S', 'T1'],
  ['mermaid-editor', 'MermaidEditorTool', 'Mermaid 在线编辑器', '🧭', '用文本绘制流程图、时序图、类图等，实时渲染并导出 SVG/PNG', 'dev', ['mermaid', '流程图', '图表'], 7, 'XL', 'T2'],

  ['base64-tool', 'Base64Tool', 'Base64 编解码', '🔤', '文本与文件的 Base64 编码/解码，支持 URL-safe 变体与换行', 'encode', ['base64', '编码', '解码'], 11, 'M', 'T2'],
  ['url-tool', 'UrlTool', 'URL 编解码与参数解析', '🔗', '编码/解码 URL、解析并编辑 Query 参数、识别 UTM 标签', 'encode', ['url', 'query', 'utm'], 12, 'M', 'T3'],
  ['hash-tool', 'HashTool', 'Hash 生成器', '#️⃣', 'MD5 / SHA-1 / SHA-224/256/384/512 摘要与 HMAC，支持大小写切换', 'encode', ['md5', 'sha256', 'hash', 'hmac'], 13, 'M', 'T1'],

  ['csv-json', 'CsvJsonTool', 'CSV 与 JSON 互转', '🔄', 'CSV 与 JSON 双向转换，支持自定义分隔符与表头设置', 'data', ['csv', 'json', '转换'], 21, 'L', 'T2'],
  ['json-xml', 'JsonXmlTool', 'JSON 转 XML / Excel', '📤', 'JSON 导出为 XML 或 Excel 表格，可配置根元素与数组节点名', 'data', ['xml', 'excel', '导出'], 22, 'L', 'T1'],
  ['excel-match', 'ExcelMatchTool', 'Excel 数据匹配', '🔍', '双表按字段匹配合并（VLOOKUP 式），实时预览并导出 xlsx', 'data', ['excel', 'vlookup', '匹配'], 23, 'XL', 'T6'],

  ['text-diff', 'TextDiffTool', '文本差异对比', '↔️', '行级 + 字符级差异高亮，支持忽略空白/大小写/空行', 'text', ['diff', '对比', '差异'], 31, 'L', 'T2'],
  ['markdown-editor', 'MarkdownEditorTool', 'Markdown 编辑预览', '📝', 'Markdown 实时预览、GFM 支持、代码高亮与导出 HTML', 'text', ['markdown', '预览', '文档'], 32, 'L', 'T2'],

  ['image-compress', 'ImageCompressTool', '图片压缩与格式转换', '🖼️', 'PNG/JPG/WebP/BMP 互转，质量与尺寸调节，支持批量处理', 'image', ['图片', '压缩', 'webp'], 41, 'L', 'T5'],
  ['image-filter', 'ImageFilterTool', '图片滤镜', '✨', '亮度/对比度/饱和度/色相调节与预设艺术滤镜，实时预览', 'image', ['滤镜', '调色', '图片'], 42, 'L', 'T5'],
  ['image-crop', 'ImageCropTool', '图片截图工具', '✂️', '上传图片后矩形框选多次截图，支持比例锁定与原图坐标导出', 'image', ['截图', '裁剪', '选区'], 43, 'XL', 'T5'],
  ['image-matting', 'ImageMattingTool', '图片去背景', '🫧', '按颜色阈值与灵敏度智能抠图，支持边缘羽化与背景替换', 'image', ['去背景', '抠图', '透明'], 44, 'L', 'T5'],
  ['image-slice', 'ImageSliceTool', '图片切图工具', '🔪', '按透明像素自动检测分割雪碧图，可调节灵敏度并批量下载', 'image', ['切图', '雪碧图', '分割'], 45, 'L', 'T5'],
  ['favicon-gen', 'FaviconGenTool', 'Favicon 生成器', '🌟', '一键生成全套网站图标、ICO、manifest.json 与 HTML 代码片段', 'image', ['favicon', '图标', 'ico'], 46, 'M', 'T1'],
  ['exif-viewer', 'ExifViewerTool', 'EXIF 查看与清除', '📷', '查看照片元数据并一键清除 GPS、拍摄时间等敏感信息', 'image', ['exif', '元数据', '隐私'], 47, 'M', 'T1'],
  ['qr-scanner', 'QrScannerTool', '二维码扫描器', '📸', '识别图片中的二维码并解析 URL/WiFi/名片等内容，本地识别', 'image', ['二维码', '扫码', '识别'], 48, 'M', 'T1'],

  ['color-picker', 'ColorPickerTool', '颜色转换与取色器', '💧', 'HEX/RGB/HSL/HSV/CMYK 互转、可视化取色与 WCAG 对比度检查', 'color', ['取色', '颜色', '对比度'], 51, 'M', 'T4'],
  ['chart-color', 'ChartColorTool', '图表配色', '🎨', '按基色生成协调配色方案并输出色值，适合图表与界面设计', 'color', ['配色', '设计', '图表'], 52, 'M', 'T4'],

  ['timestamp', 'TimestampTool', '时间戳转换', '🕒', 'Unix 时间戳与日期互转，支持秒/毫秒与批量转换', 'time', ['时间戳', 'unix', '日期'], 61, 'M', 'T4'],
  ['world-clock', 'WorldClockTool', '世界时钟与时区转换', '🌍', '多城市时钟并列、时区换算与倒计时，自动处理夏令时', 'time', ['时区', '时钟', '倒计时'], 62, 'L', 'T6'],
  ['calendar', 'CalendarTool', '日历', '📅', '年/月切换日历，标识法定节假日与调休上班日', 'time', ['日历', '节假日', '调休'], 63, 'M', 'T6'],

  ['unit-convert', 'UnitConvertTool', '单位换算器', '📐', '长度/重量/温度/面积/体积/速度/数据存储/时间八大类换算', 'calc', ['单位', '换算', '转换'], 71, 'M', 'T4'],
  ['loan-calc', 'LoanCalcTool', '贷款 / 房贷计算器', '🏠', '等额本息与等额本金对比、提前还款模拟与还款明细导出', 'calc', ['房贷', '贷款', '月供'], 72, 'M', 'T4'],
  ['bmi-calc', 'BmiCalcTool', 'BMI 与每日热量计算', '⚖️', 'BMI、基础代谢、每日热量、理想体重与三大营养素分配', 'calc', ['bmi', '热量', '健康'], 73, 'M', 'T4'],

  ['uuid-gen', 'UuidGenTool', 'UUID / ID 生成器', '🆔', '批量生成 UUID v4/v7、NanoID、ULID、ObjectId 与短 ID', 'gen', ['uuid', 'nanoid', 'ulid'], 81, 'S', 'T1'],
  ['password-gen', 'PasswordGenTool', '密码生成器', '🔐', '本地生成可配置强度的随机密码，支持自定义字符集与熵值评估', 'gen', ['密码', '随机', '安全'], 82, 'S', 'T1'],
  ['qrcode-gen', 'QrcodeGenTool', '二维码生成器', '📱', '生成自定义颜色与尺寸的二维码，支持纠错等级与 Logo，导出 PNG/SVG', 'gen', ['二维码', 'qrcode', '生成'], 83, 'M', 'T4'],
  ['random-picker', 'RandomPickerTool', '随机抽签 & 决策转盘', '🎲', '转盘抽奖、随机抽签、随机数、骰子与抛硬币五合一', 'gen', ['随机', '抽签', '转盘'], 84, 'M', 'T5']
]

let created = 0
for (const [id, comp, name, icon, desc, cat, tags, order, size, layout] of TOOLS) {
  const dir = path.join(ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  const content = `import type { ToolboxToolEntry } from '../../types'

/** ${name}（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: '${id}',
    name: '${name}',
    icon: '${icon}',
    description: '${desc}',
    category: '${cat}',
    tags: ${JSON.stringify(tags)},
    status: 'active',
    kind: 'internal',
    order: ${order},
    modalSize: '${size}',
    layout: '${layout}',
    addedAt: '2026-09-30'
  },
  component: () => import('./${comp}.vue')
}

export default entry
`
  fs.writeFileSync(path.join(dir, 'index.ts'), content, 'utf8')
  created++
}
console.log('generated tool entries:', created)
