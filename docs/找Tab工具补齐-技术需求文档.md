# 找Tab 应用商店工具类应用补齐 —— 技术需求文档

> 版本：v1.0
> 日期：2026-11-02
> 数据来源：`GET https://zhaotabapi.dkvirus.com/api/v1/store-apps?type=internal`（页面 `https://www.zhaotab.com/store?in=zhaotab` 的实际数据源）
> 比对基线：`D:/easy-web-tab/src/toolbox/tools/*`（129 个已注册工具）

---

## 1. 比对结果统计

### 1.1 总量

| 项 | 数量 |
|---|---|
| 找Tab 应用商店应用总数 | 124 |
| 其中「游戏」类（本次排除） | 48 |
| 参与比对的工具类应用 | 76 |
| 本系统工具箱现有工具 | 129 |

### 1.2 工具类应用分布与比对结论

| 分类 | 找Tab 数量 | 本系统已覆盖 | 完全缺失（新建） | 部分覆盖（增强） |
|---|---|---|---|---|
| 效率工具 | 19 | 6 | 13 | 0 |
| 开发工具 | 28 | 17 | 11 | 1 |
| 设计资源 | 12 | 6 | 5 | 0 |
| 生活实用 | 15 | 4 | 11 | 1 |
| 阅读 | 2 | 0 | 1 | 0 |
| 时间/换算类交叉 | — | — | 0 | 1 |
| **合计** | **76** | **33** | **41** | **3** |

> 说明：「设计资源」中 `image-tools`（图片工具合集）是站内聚合页，非独立工具，不计入缺失；
> `canvas-editor`（Canvas 画板）与 `whiteboard`（在线画板）功能重叠，合并为 **1 个** `whiteboard` 实现，故设计资源新建数由 6 降为 5；
> 「时间/换算类交叉」指 `byte-converter`（字节换算）归入既有 `unit-convert` 增强。

### 1.3 优先级分布

| 优先级 | 数量 | 判定标准 |
|---|---|---|
| P1 | 12 | 纯前端零依赖、需求高频、实现量小（≤400 行） |
| P2 | 16 | 纯前端但需内置数据集 / 中等实现量 |
| P3 | 13 | 依赖外部网络、硬件能力或实现量大（>600 行） |
| 增强 | 3 | 扩展既有工具，不新建目录 |

---

## 2. 已覆盖对照表（不列入实施范围）

| 找Tab 应用 | 本系统对应 | 结论 |
|---|---|---|
| 密码生成器 | `password-gen` | 完全覆盖 |
| 二维码工具 | `qrcode-gen` + `qr-scanner` | 完全覆盖 |
| 语音工具（TTS/STT） | `tts` + `stt` | 完全覆盖 |
| PDF 裁剪工具 | `pdf-crop` | 覆盖（实现口径不同：本系统按页边距裁剪） |
| 视频播放器 | `media-player` | 覆盖 |
| 秒表计时器 | `timer` | 覆盖 |
| JSON 格式化 | `json-format` | 完全覆盖 |
| CURL 格式化 | `curl-to-code` | 覆盖（本系统更强，可直接转多语言代码） |
| 颜色格式转换 | `color-picker` | 覆盖 |
| 文本差异对比 | `text-diff` | 覆盖 |
| Base64 转换器 | `base64-tool` | 覆盖 |
| JSON / CSV 转换 | `csv-json` | 覆盖 |
| 对称加密工具 | `file-encrypt`（AES-256-GCM） | 覆盖（DES 不实现，已淘汰算法） |
| 哈希工具 | `hash-tool` | 覆盖 |
| 正则测试 | `regex-test` | 覆盖 |
| URL 编解码 | `url-tool` | 覆盖 |
| 进制转换 | `base-convert` | 覆盖 |
| Cron 表达式生成器 | `cron-builder` | 覆盖 |
| JWT 解码器 | `jwt-decode`（+ `jwt-gen`） | 覆盖 |
| WebSocket 在线测试 | `websocket-test` | 覆盖 |
| 端口检测 | `ping-check` | **部分覆盖** → 见 §4-B2 |
| 字节换算 | `unit-convert` | **部分覆盖** → 见 §4-B1 |
| 图片格式转换 / 图片压缩 | `image-compress` | 覆盖 |
| 图片裁切 | `image-crop` | 覆盖 |
| 图片拼接 | `image-stitch` | 覆盖 |
| 图片去背景 | `image-matting` | 覆盖 |
| 图片工具合集 | 站内聚合页 | 不适用 |
| 万年历 | `calendar` | **部分覆盖** → 见 §4-B3 |
| BMI 计算器 | `bmi-calc` | 覆盖 |
| 科学计算器 | `sci-calc` | 覆盖 |
| 世界时钟 | `world-clock` | 覆盖 |
| 希腊神话 | 内容型应用，非工具 | 排除 |
| 游戏 ×48 | — | 本次排除 |

---

## 3. 缺失工具总清单（41 项）

### 3.1 效率工具（13）

| # | 工具 id | 名称 | 优先级 | 外部依赖 |
|---|---|---|---|---|
| 1 | `whiteboard` | 在线画板（含 Canvas 画板） | P1 | 无 |
| 2 | `four-quadrant` | 四象限笔记 | P1 | 无 |
| 3 | `two-factor` | 身份验证器（TOTP/HOTP） | P1 | 无 |
| 4 | `todo` | 待办事项 | P1 | 无 |
| 5 | `word-count` | 字数统计 | P1 | 无 |
| 6 | `unzip` | 在线解压 ZIP | P1 | 无（fflate） |
| 7 | `speed-test` | 网络测速 | P2 | 需下行测速端点 |
| 8 | `task-list` | 树状任务列表 | P2 | 无 |
| 9 | `typeset` | 公众号排版 | P2 | 无 |
| 10 | `translator` | 中英互译 + 词汇本 | P2 | 可选外部 API |
| 11 | `wake-lock` | 防休眠 | P3 | Screen Wake Lock API |
| 12 | `smart-clipboard` | 智能剪贴板 | P3 | Clipboard + IndexedDB |
| 13 | `lan-transfer` | 局域网文件共享 | P3 | WebRTC DataChannel |

### 3.2 开发工具（11）

| # | 工具 id | 名称 | 优先级 | 外部依赖 |
|---|---|---|---|---|
| 14 | `ip-query` | IP 查询（本机公网 IP / 归属地 / DNS） | P1 | 需 IP 回显接口 |
| 15 | `case-convert` | 大小写与命名格式转换 | P1 | 无 |
| 16 | `html-editor` | HTML 编辑器（实时预览） | P1 | 无 |
| 17 | `svg-editor` | SVG 编辑器（代码 ⇄ 渲染） | P1 | 无 |
| 18 | `code-screenshot` | 代码美化截图 | P2 | 无（自研高亮） |
| 19 | `imei-tool` | IMEI 校验与生成 | P2 | 无 |
| 20 | `http-status` | HTTP 状态码速查 | P2 | 无（内置数据） |
| 21 | `browser-env` | 浏览器环境检测 | P2 | 无 |
| 22 | `mock-data` | 随机数据生成器 | P2 | 无 |
| 23 | `ascii-table` | ASCII 码表 | P3 | 无（内置数据） |
| 24 | `whois` | Whois / RDAP 查询 | P3 | RDAP 外部接口 |

### 3.3 设计资源（5）

| # | 工具 id | 名称 | 优先级 | 外部依赖 |
|---|---|---|---|---|
| 25 | `nine-grid` | 九宫格切图 | P1 | 无 |
| 26 | `avatar-generator` | 随机头像生成 | P2 | 无 |
| 27 | `seal-maker` | 印章生成器 | P2 | 无 |
| 28 | `random-image` | 随机图片 | P3 | 外部图源（可降级本地生成） |
| 29 | `pindou` | 拼豆图纸生成器 | P3 | 无 |

### 3.4 生活实用（11）

| # | 工具 id | 名称 | 优先级 | 外部依赖 |
|---|---|---|---|---|
| 30 | `date-calculator` | 日期计算器 | P1 | 无 |
| 31 | `piano` | 在线钢琴 | P2 | WebAudio |
| 32 | `emoji-finder` | Emoji 快速查询 | P2 | 无（内置数据） |
| 33 | `copybook` | 字帖生成器 | P2 | 无（Canvas 排版） |
| 34 | `arithmetic` | 算术题生成器 | P2 | 无 |
| 35 | `cheer-board` | 电子应援板 | P3 | 无 |
| 36 | `jubensha` | 剧本杀开本助手 | P3 | 无（单机版） |
| 37 | `dish-order` | 点菜助手 | P3 | 无 |
| 38 | `reaction-test` | 手速测试 | P3 | 无 |
| 39 | `pinyin` | 拼音练习 | P3 | 无（内置词表） |
| 40 | `radio-player` | 电台随身听 | P3 | 外部音频流 |

### 3.5 阅读（1）

| # | 工具 id | 名称 | 优先级 | 外部依赖 |
|---|---|---|---|---|
| 41 | `reading-notes` | 读书笔记 | P2 | 无（IndexedDB） |

---

## 4. 通用实现规范（全部 41 项通用）

### 4.1 目录与注册（强制）

```
src/toolbox/tools/<id>/
├── index.ts            # 默认导出 ToolboxToolEntry
├── <Xxx>Tool.vue       # 工具组件（懒加载）
└── <xxx>Core.ts        # 可选：纯逻辑（仅当逻辑可单测时拆分）
```

- 注册表 `src/toolbox/registry.ts` 用 `import.meta.glob('./tools/*/index.ts', { eager: true })` 自动扫描，**新增工具无需改动任何既有文件**。
- `index.ts` 结构严格对齐既有格式：

```ts
import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: '<id>',
    name: '<中文名>',
    icon: '<emoji>',
    description: '<一句话描述，参与搜索>',
    category: '<分类 id>',
    tags: ['...'],
    status: 'active',
    kind: 'internal',
    order: <number>,
    modalSize: 'S' | 'M' | 'L' | 'XL',
    layout: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6',
    addedAt: 'YYYY-MM-DD'
  },
  component: () => import('./<Xxx>Tool.vue')
}
export default entry
```

- `order` 取值：接在现有最大值之后递增，禁止与既有值冲突。
- `category` 必须从 `src/toolbox/config/categories.ts` 已定义的 id 中选取：`dev / encode / data / text / image / color / time / calc / gen / effi / pdf / cert / doc / device / media / loan / science / other`。

### 4.2 UI 规范（强制）

- 复用 `src/toolbox/styles/tool-ui.css` 的类名：`.tu-t1~.tu-t6` 布局、`.tu-card/.tu-card-title/.tu-card-value`、`.tu-field/.tu-label`、`.tu-input/.tu-textarea/.tu-select/.tu-range`、`.tu-btn`、`.tu-out`、`.tu-table/.tu-table-wrap`、`.tu-hint/.tu-error/.tu-alert`、`.tu-grid`、`.tu-stat`、`.tu-toolbar`。
- 复用共享小组件：`components/tool/TuField.vue`、`TuOutput.vue`、`TuDrop.vue`、`TuNumberResult.vue`。
- **禁止引入新的 UI 框架或自定义按钮体系**；颜色一律用 Design Token（`--color-*`），禁止硬编码色值。
- 弹框尺寸：简单工具 `S`/`M`，需要画布或双栏的用 `L`/`XL`。

### 4.3 数据与安全约束（强制）

- **所有工具纯前端实现，文件与文本一律不上传服务器**；描述中必须写明「纯本地处理」。
- **严禁站外 URL 跳转**（`ToolboxToolMeta.url` 仅限站内路由）；需要外部数据时只能走同源后端代理，新增代理须同步改 nginx 三个 server 块（80/16718/443）。
- 涉及持久化（如 `todo`/`task-list`/`reading-notes`/`two-factor`/`smart-clipboard`）统一走 `useToolboxPrefs` + IndexedDB，**不得自建第二套存储**。
- `two-factor` 的密钥属敏感数据，本地存储必须加密（复用 `useCrypto.ts` / crypto-js），且 UI 默认隐藏、需点击显式展示。
- 危险操作（删除、清空、覆盖）须二次确认。

### 4.4 质量门禁（每批次交付前必须全绿）

1. `npm run typecheck` —— 0 类型错误（已知预存错误 `BookSearchBar.vue(35,29)` 除外）
2. `npm run lint` —— 0 error
3. `npm run build` —— 构建成功
4. 纯逻辑拆分出 `*Core.ts` 的工具，追加 `scripts/test-*-core.ts` 并纳入 `package.json` 的 `test:*`

---

## 5. 逐工具需求明细

> 记号：**[IN]** 本期实现范围 / **[OUT]** 明确不做 / **接口** 纯逻辑函数签名 / **边界** 约束与降级策略

### 5.1 效率工具

#### 1. `whiteboard` 在线画板（P1，合并 zhaotab 的 whiteboard + canvas-editor）

- **功能说明**：浏览器内自由画板，支持画笔、直线、矩形、椭圆、箭头、文字、橡皮，可撤消/重做、清空、导出 PNG。
- **核心需求**：① 工具栏选择绘图类型；② 颜色/线宽/填充开关；③ 撤销重做栈（快照式，上限 30 步）；④ 导出 PNG（含透明背景选项）；⑤ 画布尺寸自适应工具面板。
- **[IN]**：8 类图元、撤销重做、颜色线宽、PNG 导出、清空二次确认。
- **[OUT]**：多人协作、图层、矢量对象编辑（选中后二次改属性）、云保存。
- **接口**：`tools/whiteboard/whiteboardCore.ts`
  - `type Shape = { type: 'pen'|'line'|'rect'|'ellipse'|'arrow'|'text'|'eraser'; color: string; width: number; fill: boolean; points: [number,number][]; text?: string }`
  - `drawShape(ctx: CanvasRenderingContext2D, s: Shape): void`
  - `pushHistory(stack: Shape[][], cur: Shape[], limit = 30): Shape[][]`
- **边界**：文字图元用 `prompt` 之外的内联输入（禁用 `prompt/alert`）；导出用 `canvas.toBlob`，文件名 `whiteboard-<timestamp>.png`；`layout: 'T5'`，`modalSize: 'XL'`，`category: 'image'`。

#### 2. `four-quadrant` 四象限笔记（P1）

- **功能说明**：按「重要/紧急」四象限整理任务，支持拖拽或按钮移动象限、标记完成、本地持久化。
- **核心需求**：四宫格布局、新增/编辑/删除条目、象限间移动、完成态划线、按象限统计数量。
- **[IN]**：四象限 CRUD、移动、完成态、计数、IndexedDB 持久化。
- **[OUT]**：提醒、截止日期、与工作台待办模块互通。
- **接口**：`tools/four-quadrant/quadrantCore.ts`
  - `type Quadrant = 'q1'|'q2'|'q3'|'q4'`（q1 重要紧急 / q2 重要不紧急 / q3 紧急不重要 / q4 不重要不紧急）
  - `normalizeQuadrantData(raw: unknown): QuadrantData`
  - `moveItem(data: QuadrantData, id: string, to: Quadrant): QuadrantData`
  - `countByQuadrant(data: QuadrantData): Record<Quadrant, number>`
- **边界**：单条文本 ≤ 200 字；总量上限 500 条，超出提示；`layout: 'T6'`，`modalSize: 'L'`，`category: 'effi'`。

#### 3. `two-factor` 身份验证器（TOTP/HOTP）（P1）

- **功能说明**：网页版两步验证器，添加账号密钥后实时生成 6 位动态验证码，用法同 Google Authenticator。
- **核心需求**：① 支持 `otpauth://` URI 解析与手动输入密钥（Base32）；② TOTP 默认 30s 周期 / SHA1 / 6 位；③ 倒计时进度条；④ 账号列表增删；⑤ 密钥本地加密存储。
- **[IN]**：otpauth URI 解析、Base32 解码、HMAC-SHA1 TOTP、6/8 位、30/60s 周期、倒计时环、增删账号、复制验证码。
- **[OUT]**：HOTP 计数器模式、云同步、二维码扫描录入（复用 `qr-scanner` 不在本工具内）、Steam Guard。
- **接口**：`tools/two-factor/totpCore.ts`
  - `parseOtpauthUri(uri: string): { secret: string; issuer?: string; account?: string; digits: number; period: number; algorithm: string } | null`
  - `base32Decode(input: string): Uint8Array`
  - `hotp(secret: Uint8Array, counter: number, digits: number): string`
  - `totp(secret: Uint8Array, digits: number, period: number, now = Date.now()): string`
  - `remainingSeconds(period: number, now = Date.now()): number`
- **边界**：HMAC 用 `crypto.subtle`（异步），须处理非安全上下文（http 非 localhost）下 `crypto.subtle` 不可用 → 降级提示；密钥存储走 `useCrypto.ts` 加密；列表默认隐藏密钥，点击「显示」才解密；`layout: 'T6'`，`modalSize: 'M'`，`category: 'cert'`。

#### 4. `todo` 待办事项（P1）

- **功能说明**：简洁个人待办清单，分类管理、多状态流转、拖拽排序。
- **核心需求**：分类（默认「全部/工作/生活/学习」+ 自定义）、状态（待办/进行中/已完成）、拖拽排序、本地持久化。
- **[IN]**：分类 CRUD、三态流转、拖拽排序、计数、清空已完成（二次确认）。
- **[OUT]**：提醒、重复规则、与工作台 `WorkbenchTodos` 共享数据（两套独立，避免耦合）。
- **接口**：`tools/todo/todoToolCore.ts`
  - `type TodoStatus = 'pending'|'doing'|'done'`
  - `normalizeTodoData(raw: unknown): TodoData`
  - `moveTodo(list: TodoItem[], from: number, to: number): TodoItem[]`
  - `statsOf(list: TodoItem[]): { pending: number; doing: number; done: number }`
- **边界**：单条 ≤ 200 字；拖拽用 HTML5 draggable，移动端降级为「上移/下移」按钮；`layout: 'T6'`，`modalSize: 'M'`，`category: 'effi'`。

#### 5. `word-count` 字数统计（P1）

- **功能说明**：实时统计中文字数、英文单词、标点、行数、字符数与阅读时长，并列出高频字词 Top 20。
- **核心需求**：输入即统计（防抖 200ms）、中英文分别计数、排除/计入空白开关、高频词榜、预估阅读时长。
- **[IN]**：6 项计数、高频字词 Top20、阅读时长（中文 300 字/分钟，英文 200 词/分钟）、复制统计结果。
- **[OUT]**：文件导入（受纯前端限制，仅支持文本粘贴）、导出报表。
- **接口**：`tools/word-count/wordCountCore.ts`
  - `interface WordCountResult { chars: number; charsNoSpace: number; chinese: number; englishWords: number; punctuation: number; lines: number; readMinutes: number; topWords: { word: string; count: number }[] }`
  - `countText(text: string, opts?: { countSpace?: boolean; topN?: number }): WordCountResult`
- **边界**：输入上限 1,000,000 字符，超出截断提示；高频词中文按 2 字词切分、英文按 `\b\w+\b`；`layout: 'T4'`，`modalSize: 'M'`，`category: 'text'`。

#### 6. `unzip` 在线解压 ZIP（P1）

- **功能说明**：浏览器本地解压 ZIP，列出文件树、预览文本、单独下载或全部重新打包下载。
- **核心需求**：拖入/选择 ZIP、列出条目（路径/大小/压缩后大小）、文本类预览（≤ 200KB）、单文件下载、全部打包下载。
- **[IN]**：ZIP 解析（fflate `unzip`）、条目列表、文本预览、单文件下载、按前缀过滤。
- **[OUT]**：RAR/7z 等其它格式、加密 ZIP 解密（`zip-encrypt` 是自研 AES-GCM，非标准 ZIP 加密，不互通）、目录级打包下载。
- **接口**：`tools/unzip/unzipCore.ts`
  - `interface ZipEntryView { name: string; size: number; dir: boolean }`
  - `listEntries(files: Record<string, Uint8Array>): ZipEntryView[]`
  - `isTextEntry(name: string): boolean`
  - `formatSize(bytes: number): string`
- **边界**：单个 ZIP ≤ 200MB，条目 > 2000 只渲染前 2000；预览仅 `text/*` 与常见代码扩展名，二进制一律只下载；`layout: 'T6'`，`modalSize: 'L'`，`category: 'effi'`。

#### 7. `speed-test` 网络测速（P2）

- **功能说明**：测试下载速度与网络延迟。
- **核心需求**：下行测速（多线程并发下载同源静态资源）、延迟 Ping（同源小文件 RTT）、结果可视化。
- **[IN]**：下行带宽、延迟、抖动、历史 5 次记录。
- **[OUT]**：**上行测速（无后端接收端，无法实现）**、外部测速节点、跨运营商对比。
- **接口**：`tools/speed-test/speedCore.ts`
  - `calcSpeedMbps(bytes: number, ms: number): number`
  - `percentile(values: number[], p: number): number`
- **边界**：测速端点用同源 `public/backgrounds/*.jpg`（≥1MB）加 `?t=<ts>` 破缓存，并发 4 路、单路限时 10s；UI 明确标注「上行测速暂不支持」；`layout: 'T4'`，`modalSize: 'M'`，`category: 'effi'`。

#### 8. `task-list` 树状任务列表（P2）

- **功能说明**：树状任务清单，多列表分组、状态流转、时间规划与归档。
- **核心需求**：多列表（看板式分组）、任务树（父子层级，最多 3 层）、状态流转、归档区、本地持久化。
- **[IN]**：列表 CRUD、任务树（3 层）、状态、折叠展开、归档/还原、持久化。
- **[OUT]**：拖拽跨列表（改为菜单移动）、甘特图、提醒。
- **接口**：`tools/task-list/taskListCore.ts`
  - `normalizeTaskData(raw: unknown): TaskData`
  - `flattenTree(nodes: TaskNode[], depth = 0): { node: TaskNode; depth: number }[]`
  - `maxDepth(nodes: TaskNode[]): number`
- **边界**：每层子任务 ≤ 50，总节点 ≤ 1000；`layout: 'T6'`，`modalSize: 'XL'`，`category: 'effi'`。

#### 9. `typeset` 公众号排版（P2）

- **功能说明**：Markdown 输入 → 公众号风格实时预览 → 一键复制带样式正文。
- **核心需求**：Markdown 渲染（复用 `markdown-it`）、主题选择（≤6 套，含标题/引用/分割线装饰）、代码块高亮、复制到剪贴板（保留样式）、草稿自动保存本地。
- **[IN]**：6 套内置主题、实时预览、复制带样式 HTML、草稿本地保存（30 天）。
- **[OUT]**：zhaotab 的 35 套主题（只做 6 套代表款）、图片上传、直接推送公众号。
- **接口**：`tools/typeset/typesetCore.ts`
  - `THEMES: { id: string; name: string; css: string }[]`
  - `renderWithTheme(md: string, themeId: string): string`（内部用 markdown-it）
  - `inlineStylesForClipboard(html: string, themeId: string): string`
- **边界**：复制必须内联样式（公众号会剥离 `<style>`）；草稿存 IndexedDB，key `toolbox:typeset:draft`；`layout: 'T2'`，`modalSize: 'XL'`，`category: 'text'`。

#### 10. `translator` 中英互译 + 词汇本（P2）

- **功能说明**：中英互译，查过的词收进个人词汇库按熟悉度复习。
- **核心需求**：离线内置词库（常用 3000 词 + 500 短语）、查词、词汇本 CRUD、熟悉度标记、自测复习。
- **[IN]**：离线词库查询（精确 + 前缀模糊）、词汇本、熟悉度、自测。
- **[OUT]**：在线机器翻译 API（需密钥，不做默认依赖）、整句语法翻译、语音朗读（可复用 `tts` 但不内嵌）。
- **接口**：`tools/translator/translatorCore.ts`
  - `lookup(word: string, dir: 'zh2en'|'en2zh'): { word: string; trans: string[]; examples?: string[] } | null`
  - `suggest(prefix: string, limit = 10): string[]`
  - `normalizeVocab(raw: unknown): VocabData`
- **边界**：离线词库为内置静态数据（控制在 200KB 内）；未命中时明确提示「离线词库未收录」，不伪造结果；`layout: 'T4'`，`modalSize: 'M'`，`category: 'text'`。

#### 11. `wake-lock` 防休眠（P3）

- **功能说明**：一键保持屏幕常亮。
- **核心需求**：Screen Wake Lock 开关、状态显示、剩余可支持性检测。
- **[IN]**：获取/释放 Wake Lock、状态指示、页面可见性变化时自动重获。
- **[OUT]**：后台保活（浏览器限制，不可实现）。
- **接口**：`tools/wake-lock/wakeLockCore.ts` → `isWakeLockSupported(): boolean`
- **边界**：不支持时（Firefox/Safari 部分版本、非 HTTPS）明确降级提示并说明原因；切换标签页释放后需用户重新点击；`layout: 'T1'`，`modalSize: 'S'`，`category: 'effi'`。

#### 12. `smart-clipboard` 智能剪贴板（P3）

- **功能说明**：自动记录复制历史，按链接/代码/图片/文本分类，可搜索、置顶、找回。
- **核心需求**：监听 `copy` 事件 + 手动粘贴录入、分类、搜索、置顶、删除、清空。
- **[IN]**：文本/链接/代码/图片（仅 dataURL 缩略）四类、搜索、置顶、删除、上限 200 条 FIFO。
- **[OUT]**：系统级剪贴板读取（需权限，仅支持手动 Ctrl+V 录入或页面内 copy 捕获）、云同步。
- **接口**：`tools/smart-clipboard/clipboardCore.ts`
  - `classifyClip(text: string): 'url'|'code'|'json'|'text'`
  - `normalizeClipData(raw: unknown): ClipData`
- **边界**：仅在工具打开时捕获页面内 copy；图片类仅保存 ≤ 2MB 的 dataURL；数据存 IndexedDB，默认 30 天过期；`layout: 'T6'`，`modalSize: 'L'`，`category: 'effi'`。

#### 13. `lan-transfer` 局域网文件共享（P3）

- **功能说明**：同局域网两台设备直连互传文件。
- **核心需求**：WebRTC DataChannel 直连，手动交换 SDP 信令（复制/粘贴，无需信令服务器）。
- **[IN]**：创建邀请码 / 加入、手动交换 SDP、单文件发送（分片 16KB）、进度显示。
- **[OUT]**：自动发现设备、多人房间、断点续传、目录传输。
- **接口**：`tools/lan-transfer/lanTransferCore.ts`
  - `chunkFile(file: File, size = 16384): Blob[]`
  - `buildFileMeta(file: File): { name: string; size: number; type: string }`
- **边界**：无 STUN 服务器时仅限同网段/本机双标签页；分片上限与背压需限速（每 100 片 `await` 一次）；单次文件 ≤ 500MB；UI 明确标注「浏览器兼容性与网络环境限制」；`layout: 'T4'`，`modalSize: 'M'`，`category: 'effi'`。

---

### 5.2 开发工具

#### 14. `ip-query` IP 查询（P1）

- **功能说明**：查看本机公网 IP 与归属地；查询任意 IP 归属或域名解析结果。
- **核心需求**：① 本机公网 IP 获取 + 归属地；② 任意 IP 查询；③ 域名 DNS 解析（A/AAAA）；④ 结果复制。
- **[IN]**：本机 IP、指定 IP 查询、域名解析、私有地址识别、结果表格与复制。
- **[OUT]**：IP 段批量查询、IP 地理位置地图可视化、历史记录持久化。
- **接口**：`tools/ip-query/ipQueryCore.ts`
  - `isPrivateIp(ip: string): boolean`（含 10/172.16-31/192.168/127/169.254/::1/fc00::/fe80::）
  - `isValidIpv4(ip: string): boolean` / `isValidIpv6(ip: string): boolean`
  - `validateDomain(d: string): boolean`
  - `formatQueryResult(raw: unknown): IpQueryResult`
- **边界**：**需要 IP 回显与归属接口** —— 优先复用同源后端代理（新增 `/api/ip-query`）；若未部署，降级为只显示本机 IP（走能回显的服务）并明确提示「归属地功能需后端支持」；`DoH`（dns.google / 阿里 223.5.5.5）作为可选解析源，失败时提示；`layout: 'T4'`，`modalSize: 'M'`，`category: 'dev'`。

#### 15. `case-convert` 大小写与命名格式转换（P1）

- **功能说明**：文本大小写与变量命名格式一键互转。
- **核心需求**：8 种格式互转 —— 原样、全大写、全小写、首字母大写、驼峰 `camelCase`、帕斯卡 `PascalCase`、蛇形 `snake_case`、短横线 `kebab-case`；输入实时同步全部结果；单词数统计。
- **[IN]**：8 种格式输出、一键复制、实时联动。
- **[OUT]**：常量式 `SCREAMING_SNAKE`（可顺带作为第 9 种，成本低则纳入）、批量多行处理（仅单行）。
- **接口**：`tools/case-convert/caseCore.ts`
  - `splitWords(input: string): string[]`（处理 camelCase 边界、数字、下划线/连字符）
  - `toCamel(words: string[]): string` / `toPascal` / `toSnake` / `toKebab` / `toUpper` / `toLower` / `toTitle`
  - `convertAll(input: string): Record<CaseKind, string>`
- **边界**：输入上限 10,000 字符；非 ASCII（中文）原样保留不参与分词；`layout: 'T4'`，`modalSize: 'M'`，`category: 'text'`。

#### 16. `html-editor` HTML 编辑器（P1）

- **功能说明**：在线编写 HTML/CSS 并实时预览，沙箱渲染。
- **核心需求**：HTML / CSS / JS 三栏代码区 + 实时预览 iframe、防抖渲染（300ms）、格式化、内置 3 套模板、导出 `.html`。
- **[IN]**：三栏编辑、iframe 沙箱预览（`sandbox="allow-scripts"`）、3 套模板、下载 HTML 文件。
- **[OUT]**：JS 控制台面板、多文件工程、协作。
- **接口**：`tools/html-editor/htmlEditorCore.ts`
  - `buildSandboxDoc(html: string, css: string, js: string): string`
  - `TEMPLATES: { id: string; name: string; html: string; css: string; js: string }[]`
- **边界**：iframe 用 `srcdoc` + `sandbox="allow-scripts"`（**不给 `allow-same-origin`**，防止逃逸）；JS 执行异常用 `window.onerror` 捕获展示；代码区用原生 `textarea`（不引入 CodeMirror）；`layout: 'T2'`，`modalSize: 'XL'`，`category: 'dev'`。

#### 17. `svg-editor` SVG 编辑器（P1）

- **功能说明**：左侧写 SVG 代码、右侧即时渲染，一键复制/下载。
- **核心需求**：代码区 + 渲染区双栏、防抖渲染、语法错误提示、画布尺寸设置、导出 SVG/PNG。
- **[IN]**：代码 ⇄ 渲染、错误提示、背景棋盘格、导出 SVG 与 PNG（PNG 需先序列化为 dataURL 再走 canvas）。
- **[OUT]**：可视化拖拽编辑、路径节点编辑、图层。
- **接口**：`tools/svg-editor/svgEditorCore.ts`
  - `sanitizeSvg(code: string): { ok: boolean; svg?: string; error?: string }`（禁止 `<script>`、`on*` 事件、`xlink:href` 非 `#` 外部引用）
  - `svgToPngDataUrl(svg: string, width: number, height: number): Promise<string>`
- **边界**：渲染前必须过 `sanitizeSvg`（复用 `core/sanitize.ts` 思路），禁止脚本执行；渲染尺寸上限 4096×4096；导出 PNG 时字体可能丢失，需在 UI 提示；`layout: 'T2'`，`modalSize: 'L'`，`category: 'dev'`。

#### 18. `code-screenshot` 代码美化截图（P2）

- **功能说明**：粘贴代码生成带语法高亮的卡片图，导出 PNG。
- **核心需求**：语言选择（JS/TS/HTML/CSS/JSON/Python/Java/Go）、主题（暗/亮 2 套）、窗口标题栏（含红黄绿灯或标题文字）、行号开关、导出 PNG（2x 缩放）。
- **[IN]**：8 种语言自研正则高亮、2 套主题、标题栏、行号、导出 PNG。
- **[OUT]**：引入 highlight.js/Prism 新依赖、背景图片、圆角阴影细项配置（提供 2 档预设即可）。
- **接口**：`tools/code-screenshot/codeShotCore.ts`
  - `highlight(code: string, lang: LangId): Token[]`（`Token = { text: string; kind: 'plain'|'keyword'|'string'|'comment'|'number'|'type'|'punct' }`）
  - `renderCard(tokens: Token[], opts: CardOpts): string`（返回 HTML 片段供 DOM 渲染后截图）
- **边界**：**不引入新依赖**，自研关键字表；用 DOM + `html-to-image` 手写替代（SVG foreignObject → canvas → PNG，避免新依赖）；代码上限 500 行 / 50KB；`layout: 'T2'`，`modalSize: 'L'`，`category: 'dev'`。

#### 19. `imei-tool` IMEI 校验与生成（P2）

- **功能说明**：校验手机 IMEI 是否有效，可按前缀批量生成测试用 IMEI。
- **核心需求**：Luhn 校验位验证、14 位自动补全 15 位、识别 IMEISV（16 位）、展示 TAC/序列号结构、批量生成。
- **[IN]**：Luhn 校验、14→15 补全、结构拆解（TAC 8 位 / SNR 6 位 / CD 1 位）、按 TAC 前缀批量生成（≤100 条）。
- **[OUT]**：真实设备查询、IMEI 黑名单。
- **接口**：`tools/imei-tool/imeiCore.ts`
  - `luhnCheckDigit(body: string): string`
  - `isValidImei(imei: string): boolean`
  - `completeImei(imei14: string): string`
  - `parseImei(imei: string): { tac: string; snr: string; cd: string; isSv: boolean } | null`
  - `generateImeis(tacPrefix: string, count: number): string[]`
- **边界**：仅用于测试，UI 显著标注「生成的 IMEI 仅供测试，禁止用于真实设备」；生成数量上限 100；`layout: 'T4'`，`modalSize: 'M'`，`category: 'gen'`。

#### 20. `http-status` HTTP 状态码速查（P2）

- **功能说明**：HTTP 状态码手册，1xx–5xx 分类浏览，附说明与典型场景。
- **核心需求**：分类标签浏览、关键字搜索、每个状态码含「英文原因短语 + 中文说明 + 典型场景」。
- **[IN]**：60+ 常用状态码内置数据、分类筛选、搜索、详情卡。
- **[OUT]**：非标准/私有状态码（如 4xx 各家自定义）、HTTP/3 专有码。
- **接口**：`tools/http-status/httpStatusData.ts`
  - `HTTP_STATUS: { code: number; phrase: string; cn: string; scene: string; cat: '1xx'|'2xx'|'3xx'|'4xx'|'5xx' }[]`
  - `searchStatus(q: string): HttpStatusItem[]`
- **边界**：纯静态数据，随包体打包（<15KB）；`layout: 'T6'`，`modalSize: 'M'`，`category: 'dev'`。

#### 21. `browser-env` 浏览器环境检测（P2）

- **功能说明**：一键检测浏览器、系统、屏幕、网络等环境参数，可导出报告。
- **核心需求**：分组展示 UA 解析、屏幕/DPR、时区语言、网络（`navigator.connection`）、存储配额、WebGL 渲染器、特性支持矩阵（剪贴板/WebRTC/WakeLock/通知等）。
- **[IN]**：6 组参数采集、特性矩阵、导出 JSON / 复制文本报告。
- **[OUT]**：指纹追踪、硬件基准跑分、电池状态（需权限且已废弃）。
- **接口**：`tools/browser-env/browserEnvCore.ts`
  - `collectEnv(): EnvReport`（纯函数，接收已采集的 navigator/screen 对象便于单测）
  - `parseUserAgent(ua: string): { browser: string; version: string; os: string; engine: string }`
  - `reportToText(r: EnvReport): string`
- **边界**：不上传任何数据；`navigator.connection` 与 `deviceMemory` 在部分浏览器缺失 → 显示「不支持」；`layout: 'T6'`，`modalSize: 'L'`，`category: 'dev'`。

#### 22. `mock-data` 随机数据生成器（P2）

- **功能说明**：用占位符描述数据结构，一键生成逼真假数据并导出 JSON。
- **核心需求**：内置占位符（`@name @email @phone @address @date @uuid @int(min,max) @float @bool @pick(a,b,c) @paragraph`）、条数设置、实时预览、导出 JSON / 复制。
- **[IN]**：12 类占位符、嵌套对象/数组解析、1–500 条、导出 JSON。
- **[OUT]**：自定义词库、正则生成、中文长文本语义生成。
- **接口**：`tools/mock-data/mockCore.ts`
  - `parseSchema(schema: string): unknown`（把含占位符的 JSON 模板解析为结构描述）
  - `fillSchema(node: unknown, seed?: number): unknown`
  - `generate(schema: string, count: number, seed?: number): unknown[]`
- **边界**：支持固定 seed 复现（自研 LCG）；条数上限 500；姓名/地址用内置中文词表（<50KB）；`layout: 'T2'`，`modalSize: 'L'`，`category: 'gen'`。

#### 23. `ascii-table` ASCII 码表（P3）

- **功能说明**：标准 ASCII 码表速查，字符与十进制/十六进制/二进制双向互查。
- **核心需求**：0–127 全表（含控制字符名称）、按进制筛选、搜索、字符 ⇄ 编码双向查询、点击复制。
- **[IN]**：128 条内置数据、三进制列展示、搜索、双向查询、复制。
- **[OUT]**：扩展 ASCII（128–255）、Unicode 区表（已有 `char-escape` 覆盖部分转义需求）。
- **接口**：`tools/ascii-table/asciiData.ts`
  - `ASCII_TABLE: { dec: number; hex: string; bin: string; oct: string; char: string; name: string }[]`
  - `findByChar(c: string): AsciiItem | null`
  - `findByCode(code: string, radix: 10|16|2|8): AsciiItem | null`
- **边界**：控制字符显示为缩写名（`NUL/SOH/…`），不渲染不可见字符本身；`layout: 'T6'`，`modalSize: 'L'`，`category: 'dev'`。

#### 24. `whois` Whois / RDAP 查询（P3）

- **功能说明**：查询域名、IP 或 ASN 的注册信息。
- **核心需求**：输入域名/IP/ASN → 查询注册商、注册/到期时间、DNS、状态。
- **[IN]**：RDAP 查询、结果结构化展示、复制。
- **[OUT]**：43 端口传统 WHOIS（浏览器无法实现）、历史 WHOIS、批量查询。
- **接口**：`tools/whois/whoisCore.ts`
  - `detectQueryType(input: string): 'domain'|'ip'|'asn'|null`
  - `pickRdapEndpoint(input: string, type: QueryType): string`（域名用 IANA bootstrap 或 `rdap.org` 兜底）
  - `normalizeRdap(json: unknown): WhoisResult`
- **边界**：**外部依赖**：RDAP 需跨域请求，`rdap.org` 是否返回 CORS 头需实测；若不通，须新增同源代理 `/api/rdap` 并同步改 nginx 三处 server 块（80/16718/443），未部署前工具置灰 `status: 'maintenance'`；查询失败给出明确错误；`layout: 'T4'`，`modalSize: 'M'`，`category: 'dev'`。

---

### 5.3 设计资源

#### 25. `nine-grid` 九宫格切图（P1）

- **功能说明**：一张图切成九宫格或自定义行列，打包下载。
- **核心需求**：行列数设置（1–6）、原图预览 + 网格线、单格预览与单独下载、全部打包 ZIP 下载。
- **[IN]**：自定义行列、网格预览、单格下载、ZIP 打包（jszip）、顺序编号。
- **[OUT]**：非均匀切分、智能主体识别切分、圆角/边框后处理。
- **接口**：`tools/nine-grid/nineGridCore.ts`
  - `sliceRects(width: number, height: number, rows: number, cols: number): Rect[]`
  - `cropToBlob(src: HTMLImageElement, rect: Rect, type?: string, quality?: number): Promise<Blob>`
- **边界**：单格边长上限 4096；原图 > 20MP 时提示可能卡顿；ZIP 用现有 `jszip` 依赖；`layout: 'T5'`，`modalSize: 'L'`，`category: 'image'`。

#### 26. `avatar-generator` 随机头像生成（P2）

- **功能说明**：一键生成卡通/像素风/字母头像，可固定种子复现，导出 SVG/PNG。
- **核心需求**：3 种风格、种子输入（可随机刷新）、配色方案、尺寸选择、导出 SVG 与 PNG。
- **[IN]**：像素风（5×5 对称）、字母风（首字 + 渐变底）、卡通几何风（圆脸+发型+表情组合）、种子复现、导出。
- **[OUT]**：AI 人像生成、上传照片转头像。
- **接口**：`tools/avatar-generator/avatarCore.ts`
  - `hashSeed(seed: string): number`
  - `buildPixelAvatar(seed: string, size = 5): string`（返回 SVG 字符串）
  - `buildLetterAvatar(letter: string, seed: string): string`
  - `buildCartoonAvatar(seed: string): string`
- **边界**：全部输出为 SVG 字符串，PNG 导出走 canvas（256/512/1024 三档）；种子为空时取随机；`layout: 'T4'`，`modalSize: 'M'`，`category: 'image'`。

#### 27. `seal-maker` 印章生成器（P2）

- **功能说明**：在线制作圆章/方章/椭圆章，字体、颜色、做旧可调，可导出透明 PNG，并支持把印章盖到图片上。
- **核心需求**：形状（圆/方/椭圆）、文字（主文字 + 副文字环绕）、字体（宋/楷/黑三选，用系统字体栈）、颜色、做旧噪点强度、导出透明 PNG；「盖到图片」= 上传底图 + 拖拽定位 + 导出。
- **[IN]**：3 种形状、主副文字、3 种字体栈、颜色、做旧、透明 PNG 导出、图片叠加导出。
- **[OUT]**：篆刻字体（需字体文件，体积大）、3D 立体效果、GIF 盖章动画。
- **接口**：`tools/seal-maker/sealCore.ts`
  - `buildSealSvg(opts: SealOpts): string`
  - `arcTextPath(text: string, radius: number, startAngle: number, sweep: number): string`（环绕文字路径）
- **边界**：字体依赖系统字体栈（`STSong/KaiTi/SimSun` 等），缺失时回落并提示；做旧用随机噪点点阵（可控强度 0–100）；导出 PNG 固定 600×600；`layout: 'T5'`，`modalSize: 'L'`，`category: 'image'`。

#### 28. `random-image` 随机图片（P3）

- **功能说明**：按任意尺寸获取随机图片。
- **核心需求**：尺寸输入（宽 1–4096 / 高 1–4096）、获取方式切换、下载。
- **[IN]**：两种模式 —— ① 外部图源（`picsum.photos`，失败自动降级）；② 本地生成渐变/几何图案占位图（无需网络）。
- **[OUT]**：图片分类筛选（外部源不支持）、批量下载。
- **接口**：`tools/random-image/randomImageCore.ts`
  - `buildRemoteUrl(w: number, h: number, seed: string): string`
  - `buildLocalSvg(w: number, h: number, seed: string): string`
  - `clampSize(n: number): number`
- **边界**：**外部依赖高风险** —— `picsum.photos` 可能不可达/被墙，必须提供本地生成模式作为默认可用路径；外部模式失败时自动回落本地并提示；`layout: 'T4'`，`modalSize: 'M'`，`category: 'image'`。

#### 29. `pindou` 拼豆图纸生成器（P3）

- **功能说明**：上传图片自动生成拼豆图纸，标注每格色号与配色清单。
- **核心需求**：图片上传、网格尺寸（16/32/48/64）、颜色量化到拼豆常用色板（内置 ~48 色 MARD/咪小窝近似色）、输出图纸（色块 + 坐标标注）与配色清单（色号 + 数量）、导出 PNG / 打印。
- **[IN]**：网格尺寸、48 色板量化、图纸渲染、配色清单、导出 PNG。
- **[OUT]**：色板自定义编辑、3D 立体预览、PDF 导出（可复用 `image-to-pdf`，不内嵌）。
- **接口**：`tools/pindou/pindouCore.ts`
  - `PALETTE: { code: string; name: string; hex: string }[]`
  - `quantize(pixels: Uint8ClampedArray, width: number, height: number, grid: number): string[]`（返回色号数组）
  - `nearestColor(rgb: [number,number,number]): PaletteItem`
  - `buildPlan(codes: string[], grid: number): { grid: number; rows: string[][]; usage: { code: string; name: string; hex: string; count: number }[] }`
- **边界**：网格上限 64×64（4096 格），再大 UI 不可读；量化用最近邻（不做 dithering，避免色点噪乱）；`layout: 'T5'`，`modalSize: 'XL'`，`category: 'image'`。

---

### 5.4 生活实用

#### 30. `date-calculator` 日期计算器（P1）

- **功能说明**：算「某天之后第 N 天是几号」与「两个日期相隔多少天」，含工作日口径。
- **核心需求**：两种模式切换（日期推算 / 日期间隔）、工作日排除选项（含法定节假日表，复用 `core/calendar.ts`）、周年/纪念日提醒口径、结果复制。
- **[IN]**：双模式、±N 天/月/年推算、间隔天数（含「含首不含尾」开关）、排除周末与节假日、结果明细。
- **[OUT]**：时区换算（`world-clock` 已有）、农历日期（`calendar` 增强项）。
- **接口**：`tools/date-calculator/dateCalcCore.ts`
  - `addDays(date: string, n: number): string`（`YYYY-MM-DD`，含负向）
  - `addMonths(date: string, n: number): string`（月末溢出钳制）
  - `diffDays(a: string, b: string, inclusive = false): number`
  - `workdaysBetween(a: string, b: string, holidays?: string[]): number`
- **边界**：日期范围 1900-01-01 ~ 2100-12-31，越界提示；月末溢出（如 1/31 + 1 月 → 2/28）；节假日表复用 `core/calendar.ts`，不重复维护；`layout: 'T4'`，`modalSize: 'M'`，`category: 'time'`。

#### 31. `piano` 在线钢琴（P2）

- **功能说明**：在线弹钢琴，鼠标/触屏/电脑键盘均可，多音色，内置曲目演示。
- **核心需求**：2 个八度键盘（C4–B5）、电脑键盘映射、3 种音色（钢琴/电子琴/八音盒，WebAudio 合成差异）、延音踏板开关、内置 3 首曲目（小星星/欢乐颂/生日歌）演示、按键高亮。
- **[IN]**：24 键、键盘映射、3 音色、踏板、3 首内置曲目演示、触屏多点。
- **[OUT]**：录音回放、MIDI 文件导入、外接 MIDI 设备。
- **接口**：`tools/piano/pianoCore.ts`
  - `NOTE_FREQS: Record<string, number>`（C4–B5 半音频率表）
  - `freqOf(note: string): number`
  - `KEYMAP: Record<string, string>`（电脑键 → 音名）
  - `SONGS: { id: string; name: string; notes: { note: string; at: number; dur: number }[] }[]`
- **边界**：AudioContext 需用户手势解锁 → 首次点击「启用声音」按钮；音色用 OscillatorNode + ADSR 包络合成（不加载音频文件）；同时发声上限 8（超出复用最旧 voice）；`layout: 'T1'`，`modalSize: 'L'`，`category: 'media'`。

#### 32. `emoji-finder` Emoji 快速查询（P2）

- **功能说明**：按分类浏览常用 Emoji，支持关键词搜索，点一下复制。
- **核心需求**：10 类分组（笑脸/手势/动物/食物/活动/旅行/物品/符号/旗帜/爱心）、中英文关键词搜索、点击复制、最近使用（本地 20 个）。
- **[IN]**：~600 个常用 Emoji 内置数据、分组、搜索、复制、最近使用。
- **[OUT]**：全量 Unicode Emoji（3000+，体积过大）、肤色/性别变体、自定义表情包。
- **接口**：`tools/emoji-finder/emojiData.ts`
  - `EMOJI_GROUPS: { id: string; name: string; icon: string; items: { char: string; name: string; keywords: string[] }[] }[]`
  - `searchEmoji(q: string, limit = 100): EmojiItem[]`
- **边界**：数据量控制在 ~80KB 内；搜索同时匹配中文名与英文关键词；`layout: 'T6'`，`modalSize: 'L'`，`category: 'text'`。

#### 33. `copybook` 字帖生成器（P2）

- **功能说明**：输入汉字生成 A4 字帖，田字格/米字格/拼音/描红可选，可直接打印。
- **核心需求**：汉字输入（≤200 字）、格子类型（田字格/米字格/四线格）、描红浓度（0/25/50%）、拼音显示（需内置拼音表）、A4 竖向排版、打印 / 导出 PDF。
- **[IN]**：4 种格子、描红浓度、拼音开关、A4 排版预览、打印（浏览器 `window.print`）。
- **[OUT]**：多音字上下文消歧、笔顺动画、任意字体上传。
- **接口**：`tools/copybook/copybookCore.ts`
  - `layoutChars(chars: string[], opts: CopybookOpts): Page[]`（每页行列数计算）
  - `PINYIN: Record<string, string>`（常用 3500 字拼音表，内置数据）
  - `pinyinOf(ch: string): string`
- **边界**：拼音表为内置静态数据（~3500 条，控制在 60KB 内），未收录字留空；打印依赖浏览器打印对话框；**导出 PDF 不内嵌**（引导用打印 → 另存为 PDF）；`layout: 'T5'`，`modalSize: 'L'`，`category: 'doc'`。

#### 34. `arithmetic` 算术题生成器（P2）

- **功能说明**：一键生成小学加减乘除口算题，可设数值范围与进退位，按 A4 排版打印，附答案。
- **核心需求**：运算类型（+ − × ÷ 混合）、数值范围、题量（20/50/100）、进退位控制、A4 排版、答案页（折叠或分页）、打印 / 重新生成。
- **[IN]**：4 类运算、范围与题量设置、进退位开关、A4 双栏排版、答案区、打印。
- **[OUT]**：分数/小数运算、应用题、答题批改。
- **接口**：`tools/arithmetic/arithmeticCore.ts`
  - `genQuestion(opts: ArithOpts, rand: () => number): ArithQuestion`
  - `genPaper(opts: ArithOpts, count: number, seed?: number): ArithQuestion[]`
  - `formatQuestion(q: ArithQuestion): string`
- **边界**：减法结果不为负；除法必须整除且除数 ≠ 0；支持固定 seed 复现；题量上限 200；`layout: 'T5'`，`modalSize: 'L'`，`category: 'doc'`。

#### 35. `cheer-board` 电子应援板（P3）

- **功能说明**：手机 LED 应援灯牌，自定义文字与配色，滚动或全屏展示。
- **核心需求**：文字输入、前景/背景色、滚动速度与方向、字号、全屏展示（Fullscreen API）。
- **[IN]**：文字/颜色/速度/方向/字号、全屏、预置 6 套配色。
- **[OUT]**：图片/视频背景、音乐同步闪烁。
- **接口**：`tools/cheer-board/cheerCore.ts`
  - `CLAMP: { textLen: 60; speed: [1, 20] }`
  - `animationDurationMs(textLen: number, speed: number, viewportWidth: number): number`
- **边界**：移动端横屏提示；全屏 API 失败时降级为「铺满工具区」；滚动用 CSS transform 动画（避免 JS 逐帧）；`layout: 'T1'`，`modalSize: 'L'`，`category: 'other'`。

#### 36. `jubensha` 剧本杀开本助手（P3，单机版）

- **功能说明**：线下剧本杀开本助手：分配角色、分发线索、投票指认真凶。
- **核心需求**：剧本录入（名称 + 角色列表 + 线索列表）、随机分配角色（输入玩家名）、线索按轮次分发、投票与结果统计。
- **[IN]**：单机版 —— 剧本模板录入、随机分角色、轮次线索分发、投票统计、本地保存剧本。
- **[OUT]**：**在线组局与分享链接（需后端，不做）**、内置剧本库、实时多端同步。
- **接口**：`tools/jubensha/jubenshaCore.ts`
  - `assignRoles(players: string[], roles: string[], seed?: number): { player: string; role: string }[]`
  - `dealClues(clues: Clue[], round: number): Clue[]`
  - `tallyVotes(votes: { voter: string; target: string }[]): { target: string; count: number }[]`
- **边界**：明确标注「单机辅助工具，需同设备传阅；在线组局功能暂不支持」；玩家数 ≤ 12；`layout: 'T6'`，`modalSize: 'L'`，`category: 'other'`。

#### 37. `dish-order` 点菜助手（P3）

- **功能说明**：按人数推荐凉菜/硬菜/炒菜搭配，边点边算总价与人均，支持按斤称重、时价、茶位费与 AA 分账。
- **核心需求**：人数输入、菜谱录入（名称/类别/价格/单位：份|斤|时价）、推荐搭配（人数 → 各类数量建议）、已选清单与总价、人均与 AA、茶位费。
- **[IN]**：菜品 CRUD（本地保存）、推荐搭配、计价（份/斤/时价）、人均/AA、茶位费。
- **[OUT]**：真实餐厅菜单数据源、在线点单。
- **接口**：`tools/dish-order/dishCore.ts`
  - `suggestCombo(headcount: number): { cold: number; main: number; stir: number; soup: number; staple: number }`
  - `calcBill(items: OrderItem[], opts: { headcount: number; teaFeePerHead: number }): Bill`
- **边界**：时价菜品需手动填单价，否则不计入总价并标红提示；AA 按人数均分（不支持按人拆分明细）；`layout: 'T6'`，`modalSize: 'L'`，`category: 'calc'`。

#### 38. `reaction-test` 手速测试（P3）

- **功能说明**：方块变绿立刻点击，测反应时间（毫秒），记录最佳与平均。
- **核心需求**：5 轮测试、随机延迟（1–4s）、抢跑判定、最佳/平均/最差、历史最佳本地保存。
- **[IN]**：5 轮、抢跑判定、统计、历史最佳（本地）、重置。
- **[OUT]**：在线排行榜、多模式（听觉/选择反应）。
- **接口**：`tools/reaction-test/reactionCore.ts`
  - `statsOf(times: number[]): { best: number; worst: number; avg: number; count: number }`
  - `isFalseStart(clickedAt: number, greenAt: number): boolean`
- **边界**：用 `performance.now()` 计时（精度高于 `Date.now()`）；抢跑需重来该轮；历史最佳存 IndexedDB；`layout: 'T1'`，`modalSize: 'S'`，`category: 'other'`。

#### 39. `pinyin` 拼音练习（P3）

- **功能说明**：看汉字拼拼音选声调、照拼音练打字，常用字词配 emoji 与读音，答对得星星。
- **核心需求**：两模式（选声调 / 打字）、100 个常用字词内置（字 + 拼音 + 声调 + emoji）、答对得星、星星总数本地保存、发音（复用 Web Speech API，可失败降级）。
- **[IN]**：100 词内置数据、两模式、星星统计、发音（可失败）。
- **[OUT]**：课本同步、错词本自动复习算法、家长端统计。
- **接口**：`tools/pinyin/pinyinData.ts`（与 `copybook` 的 `PINYIN` 表共用一份，抽取到 `core/pinyin.ts`）
  - `WORDS: { char: string; pinyin: string; tone: number; emoji: string }[]`
  - `checkTone(word: WordItem, picked: number): boolean`
- **边界**：拼音表与 `copybook` 共用 `core/pinyin.ts`，避免重复；发音不可用时静默降级（不报错打断练习）；`layout: 'T1'`，`modalSize: 'M'`，`category: 'other'`。

#### 40. `radio-player` 电台随身听（P3）

- **功能说明**：在线收听广播电台。
- **核心需求**：电台列表（名称/频率/省份/分类）、播放/停止、收藏、搜索。
- **[IN]**：内置电台清单（~200 个常见台）+ 播放 + 收藏 + 搜索 + 自定义添加（填流地址）。
- **[OUT]**：**内置流媒体源（版权与可用性风险，不预置任何直链）**、录音、节目单。
- **接口**：`tools/radio-player/radioCore.ts`
  - `STATIONS: { id: string; name: string; province: string; category: string; url?: string }[]`
  - `filterStations(q: string, province: string, category: string): Station[]`
- **边界**：**外部依赖高风险** —— 不预置任何第三方流地址（版权 + 失效风险），内置清单只提供台名/频率/省份供检索，播放需用户自行填入流地址；UI 明确说明这一点；`layout: 'T6'`，`modalSize: 'L'`，`category: 'media'`。

---

### 5.5 阅读

#### 41. `reading-notes` 读书笔记（P2）

- **功能说明**：管理书架与阅读进度，每本书随手记笔记、摘抄金句。
- **核心需求**：书架（书名/作者/分类/状态：想读/在读/已读）、阅读进度（页数或百分比）、笔记（正文 + 页码 + 标签）、金句摘抄、搜索、导出 Markdown。
- **[IN]**：书籍 CRUD、状态与进度、笔记 CRUD、金句标记、搜索、导出 Markdown。
- **[OUT]**：与 `books` 图书馆模块互通（两套独立）、封面上传、云同步。
- **接口**：`tools/reading-notes/readingCore.ts`
  - `normalizeReadingData(raw: unknown): ReadingData`
  - `progressPercent(book: BookItem): number`
  - `exportMarkdown(data: ReadingData): string`
- **边界**：数据存 IndexedDB（key `toolbox:reading-notes`），与图书模块 `books` store 完全隔离，UI 注明「与图书馆模块数据不互通」；笔记单条 ≤ 5000 字；`layout: 'T6'`，`modalSize: 'XL'`，`category: 'doc'`。

---

## 6. 增强类（3 项，不新建目录）

### B1. `unit-convert` 增强 —— 覆盖 `byte-converter`

- 现状：已支持 8 大类（长度/重量/温度/面积/体积/速度/数据存储/时间）。
- 增强点：数据存储类补 **1024 与 1000 进制切换**；新增 **网络速率单位**（bps/Kbps/Mbps/Gbps、KB/s、MB/s），并支持「带宽 Mbps ⇄ 下载速度 MB/s」互算。
- 接口：`core/unit.ts` 追加 `NET_SPEED_UNITS` 与 `convertRate(value, from, to)`。
- 边界：不改动既有单位换算结果（避免回归）；新增分组默认展开在末尾。

### B2. `ping-check` 增强 —— 覆盖 `port-checker`

- 现状：批量检测网址/IP 是否连通（HTTP 探测，绿勾/红叉表格）。
- 增强点：输入支持 `host:port` 形式；结果列补充「探测方式」标注（HTTP/HTTPS）；**并补充说明：真正的 TCP 端口连通性检测需服务端发起，前端只能做 HTTP 层探测**。
- 接口：`core/ping.ts` 追加 `parseHostPort(input): { host: string; port: number }`。
- 边界：不承诺「端口对外开放」结论，UI 文案改为「HTTP 可达性」，避免误导。

### B3. `calendar` 增强 —— 覆盖 zhaotab 万年历

- 现状：年/月切换，标识法定节假日与调休。
- 增强点：补 **农历日期、二十四节气、干支生肖**；可选「每日宜忌」（内置简表，注明娱乐参考性质）。
- 接口：`core/calendar.ts` 追加 `lunarOf(date: string): LunarInfo`、`solarTermOf(date: string): string | null`。
- 边界：农历算法内置（1900–2100 年区间），超界显示「—」；宜忌内容为民俗参考，UI 显著标注「仅供娱乐」。

---

## 7. 分批实施计划

| 批次 | 内容 | 数量 | 说明 |
|---|---|---|---|
| 第 1 批 | P1 全部 | 12 | 纯前端零依赖，风险最低，先跑通规范 |
| 第 2 批 | P2 全部 | 16 | 含内置数据集与中等实现量 |
| 第 3 批 | P3 全部 | 13 | 外部依赖与硬件能力，逐个评估可达性 |
| 第 4 批 | 增强 B1–B3 | 3 | 改动既有文件，需回归验证 |

### 7.1 第 1 批清单（P1，12 项）—— ✅ 已于 2026-11-02 全部实现

| # | id | 名称 | 分类 | order | 状态 |
|---|---|---|---|---|---|
| 1 | `whiteboard` | 在线画板 | image | 108 | ✅ |
| 2 | `four-quadrant` | 四象限笔记 | effi | 110 | ✅ |
| 3 | `two-factor` | 身份验证器 | cert | 109 | ✅ |
| 4 | `todo` | 待办事项 | effi | 111 | ✅ |
| 5 | `word-count` | 字数统计 | text | 100 | ✅ |
| 6 | `unzip` | 在线解压 ZIP | effi | 107 | ✅ |
| 7 | `ip-query` | IP 查询 | dev | 103 | ✅ |
| 8 | `case-convert` | 大小写与命名转换 | text | 101 | ✅ |
| 9 | `html-editor` | HTML 编辑器 | dev | 104 | ✅ |
| 10 | `svg-editor` | SVG 编辑器 | dev | 105 | ✅ |
| 11 | `nine-grid` | 九宫格切图 | image | 106 | ✅ |
| 12 | `date-calculator` | 日期计算器 | time | 102 | ✅ |

**落地偏差（与 §5 原文对照，均为降级实现，已在工具 UI 中明示）**

| 工具 | 偏差 | 原因 |
|---|---|---|
| `ip-query` | 不提供「归属地 / ASN」；公网 IP 走多回显服务逐个尝试，DoH 可切换阿里 / Google / Cloudflare | 归属地需服务端数据源，本期未新增后端接口 |
| `two-factor` | 密钥用 crypto-js AES + 本机随机密钥材料加密后存 IndexedDB；仅防明文散落，UI 已注明不能防御本机恶意程序 | 无主密码体系可用，不做过度承诺 |
| `unzip` | 不支持加密 ZIP（fflate 不支持 ZipCrypto / AES），报错文案明确区分「加密」与「损坏」 | 库能力限制 |
| `svg-editor` | 不引入 highlight.js 类新依赖；安全清洗为自研正则 | 包体与依赖约束 |
| `whiteboard` | 不含图层 / 矢量二次编辑 / 云保存 | 见 §5.1 [OUT] |

**新增共享模块**：`src/toolbox/core/toolStore.ts`（工具自有数据持久化，nav store 内 `toolbox-data:<id>` 键，不进云同步信封）。

**新增测试**：`scripts/test-toolbox-p1-core.ts`（`npm run test:toolbox-p1`），覆盖 12 个工具的纯逻辑共约 90 条断言。

### 7.2 第 2 批清单（P2，16 项）—— ✅ 已于 2026-11-02 全部实现

| # | id | 名称 | 分类 | order | 状态 |
|---|---|---|---|---|---|
| 1 | `speed-test` | 网速测试 | effi | 112 | ✅ |
| 2 | `task-list` | 树状任务清单 | effi | 113 | ✅ |
| 3 | `typeset` | 公众号排版 | text | 114 | ✅ |
| 4 | `translator` | 中英互译 | text | 115 | ✅ |
| 5 | `code-screenshot` | 代码美化截图 | dev | 116 | ✅ |
| 6 | `imei-tool` | IMEI 校验生成 | gen | 117 | ✅ |
| 7 | `http-status` | HTTP 状态码 | dev | 118 | ✅ |
| 8 | `browser-env` | 浏览器环境检测 | dev | 119 | ✅ |
| 9 | `mock-data` | 随机数据生成 | gen | 120 | ✅ |
| 10 | `avatar-generator` | 随机头像生成 | image | 121 | ✅ |
| 11 | `seal-maker` | 印章生成器 | image | 122 | ✅ |
| 12 | `piano` | 在线钢琴 | media | 123 | ✅ |
| 13 | `emoji-finder` | Emoji 快速查询 | text | 124 | ✅ |
| 14 | `copybook` | 字帖生成 | doc | 125 | ✅ |
| 15 | `arithmetic` | 口算题打印 | doc | 126 | ✅ |
| 16 | `reading-notes` | 读书笔记 | doc | 127 | ✅ |

**落地偏差（与 §5 原文对照，均为降级实现，已在工具 UI 中明示）**

| 工具 | 偏差 | 原因 |
|---|---|---|
| `translator` | 离线小词库（约 300 高频词），非 3000 词词典；未收录词如实提示 | 包体约束（250KB 内），不接在线翻译接口 |
| `copybook` | 拼音标注覆盖约 200 个常用字，表外字留空并提示 | 同上，内置静态表 |
| `emoji-finder` | 收录 383 个高频 Emoji（11 组），不含肤色 / 性别变体与全量 Unicode | 体量刻意控制在约 40KB |
| `speed-test` | 无上行测速 | 无后端接收端（§8 风险），仅下行 + 延迟 + 抖动 |
| `piano` | 需先点击「启用声音」解锁 AudioContext（浏览器手势策略） | 平台限制，非降级 |

**测试**：`scripts/test-toolbox-p2-core.ts`（`npm run test:toolbox-p2`），覆盖 16 个工具的纯逻辑共约 110 条断言。

### 7.3 每批次验收门禁

- [ ] `npm run typecheck` 0 错误（已知预存 `BookSearchBar.vue(35,29)` 除外）
- [ ] `npm run lint` 0 error
- [ ] `npm run build` 构建成功
- [ ] 新增 `*Core.ts` 的工具补 `scripts/test-*-core.ts` 并接入 `package.json`
- [ ] 工具箱列表页能搜到、能打开、核心交互可用（浏览器目视）
- [ ] 无站外跳转、无硬编码主题色、无新增 UI 框架

---

## 8. 风险与待确认

| 风险 | 影响工具 | 处置 |
|---|---|---|
| 外部接口 CORS / 可达性未知 | `whois`、`random-image`、`radio-player`、`ip-query` | 先行实测；不通则改同源代理（须同步 nginx 三处 server 块）或降级为「本地生成 / 手动填源」 |
| 无后端接收端 | `speed-test`（上行）、`port-checker`（TCP） | 明确缩减范围，UI 标注不支持项 |
| 版权风险 | `radio-player` | 不预置任何第三方流地址 |
| 需后端能力 | `lan-transfer`、`jubensha`（组局） | 降级为 WebRTC 手动信令 / 单机版 |
| 包体膨胀 | `emoji-finder`、`copybook`、`pindou`、`translator` | 内置数据总量控制在 250KB 内，超出的按需 `import()` 懒加载 |
| 字体缺失 | `seal-maker`、`copybook` | 系统字体栈 + 回落提示 |
| 浏览器兼容 | `wake-lock`、`smart-clipboard`、`piano`（AudioContext）、`two-factor`（crypto.subtle） | 逐项做能力检测 + 降级提示 |

**需用户确认**：增强 B1–B3（3 项）是否继续推进；P3（13 项）按用户决定**暂不实现**。

---

## 9. 实施进度

| 批次 | 数量 | 状态 | 完成日期 |
|---|---|---|---|
| P1 | 12 | ✅ 已实现并构建通过 | 2026-11-02 |
| P2 | 16 | ✅ 已实现并构建通过 | 2026-11-02 |
| P3 | 13 | ⏭️ 暂不实现（用户决定） | — |
| 增强 B1–B3 | 3 | ⏳ 待开工 | — |

**P1 验收记录（2026-11-02）**

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 0 错误（预存 `BookSearchBar.vue(35,29)` 除外） |
| `npm run lint` | ✅ 新增文件 0 error 0 warning（既有 `china-map` 2 个 error 为存量问题，未触碰） |
| `npm run build` | ✅ 构建成功，12 个工具均产出独立懒加载 chunk |
| `npm run test:toolbox-p1` | ✅ 全部用例通过 |

**P2 验收记录（2026-11-02）**

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 0 错误（预存 `BookSearchBar.vue(35,29)` 除外） |
| eslint（16 个新增目录） | ✅ 0 error 0 warning |
| `npm run build` | ✅ 构建成功，16 个工具均产出独立懒加载 chunk |
| `npm run test:toolbox-p2` | ✅ 全部用例通过（测试抓出并修复 `code-screenshot` STRING_RE 未锚定导致的分词错乱 bug） |
