# easy-web-tab UI 规范与代码风格

> **本文件是 UI / 组件层的唯一规范来源**，与根目录 `AGENTS.md` 互补：>   
> `AGENTS.md` 管**数据层与业务约定**（store、备份、版本号、测试命令），本文件管**视觉层与组件约定**。>   
> 两者冲突时，以本文件的 UI 规则为准（`AGENTS.md` 未覆盖 UI 细节）。
>
> **核心目标：消除"双轨道"——同一个功能不允许存在两套实现。**

---

## 0. 第一原则：先对照，后新增

写任何 UI 前，**必须先回答一个问题**：项目里**是否已有同类实现**？

| 场景       | 做法                                                                          |
| -------- | --------------------------------------------------------------------------- |
| 要加"保存"按钮 | 先查 §2.1 按钮体系 → 用 `.btn-submit` / `.ui-btn--primary`，**不要**自造 `.my-save-btn` |
| 要加弹框     | 先查 §2.2 → 用 `BaseDialog`，**不要**自造 `.my-modal-overlay`                       |
| 要加卡片     | 先查 §2.4 → 用 `.ui-card`，**不要**自造 `.my-card`                                  |
| 要加输入框    | 先查 §2.3 → 优先 `el-input`，特殊类型才用 `.ui-input`                                  |
| 要用颜色/间距  | 先查 §1 token，**不要**写裸 `#3b82f6` / `14px`                                     |

**如果你必须写新样式，说明现有体系不满足需求——此时先扩展全局体系，再使用，而不是在业务组件里局部实现。**

---

## 1. Design Token

所有 token 定义在 `src/style.css`（`:root`）。主题覆盖在 `src/styles/themes.css`。  
**永远通过 `var(--token, fallback)` 使用**，fallback 保留原值以防 token 缺失。

### 1.1 颜色

| 语义   | Token                                                               | 典型用途               |
| ---- | ------------------------------------------------------------------- | ------------------ |
| 主色   | `--color-primary` / `--color-primary-hover`                         | 主按钮、选中态、focus 环、链接 |
| 主色软底 | `--color-primary-soft`                                              | 选中行底、标签底           |
| 成功   | `--color-success` / `-hover` / `-soft`                              | 成功提示、启用态           |
| 警告   | `--color-warning` / `-hover` / `-soft`                              | 警告徽标               |
| 危险   | `--color-error` / `-hover` / `-soft`                                | 删除按钮、错误态、校验错误      |
| 页面底  | `--color-bg`                                                        | 页面最底层背景            |
| 卡片面  | `--color-bg-card`                                                   | 卡片/弹框/面板表面         |
| 悬停面  | `--color-bg-hover` / `--color-bg-active`                            | hover / active 背景  |
| 输入面  | `--color-bg-input`                                                  | 输入框底               |
| 边框   | `--color-border` / `--color-border-hover` / `--color-border-strong` | 常规/悬停/强调边框         |
| 文字   | `--color-text` / `--color-text-secondary` / `--color-text-muted`    | 正文/次要/弱化           |

> 另有 `--color-slate-50..900` 中性灰阶、`--color-surface` / `--color-surface-2`、`--color-shadow`。

### 1.2 间距

`--space-1..8` = **4 / 8 / 12 / 16 / 20 / 24 / 32px**（无 5/7，勿自造）。  
基础组件内必须使用；业务组件优先复用，确需新值时先考虑是否该扩展此表。

### 1.3 圆角 / 阴影 / 字体 / 动效

- 圆角：`--radius-sm 4` / `--radius-md 8`（**控件默认**）/ `--radius-lg 12`（弹框、卡片）/ `--radius-xl 16` / `--radius-full`
- 阴影：`--shadow-sm` / `--shadow-md`（悬浮）/ `--shadow-lg` / `--shadow-card` / `--shadow-card-hover` / `--shadow-modal`（弹框）/ `--shadow-dropdown`
- 字号：`--font-size-xs/sm/base/lg/xl/2xl/3xl/4xl`；行高 `--line-height-tight/base/relaxed`
- 动效：`--motion-duration 220ms` / `--motion-ease` / `--motion-hover-rise`（上浮 1px）/ `--motion-press`（缩放 0.97）
- 兼容旧写法：`--transition-fast/base/slow`（仍在用，尽量迁移到 `--motion-*`）

### 1.4 主题（accent）

`themes.css` 提供 **7 套**：`blue`（默认）/ `brown` / `pink` / `green` / `purple` / `red` / `gray`，  
通过 `html[data-accent='x']` 切换，**明暗各一套**（`html.dark[data-accent='x']`）。

`themes.css` 必须在 `dark.css` **之后**加载（见 `main.ts`），否则浅色表面会覆盖深色。

### 1.5 硬编码色禁令

| 场景     | ❌ 禁止                        | ✅ 正确                                             |
| ------ | --------------------------- | ------------------------------------------------ |
| 组件里的主色 | `color: #3b82f6`            | `color: var(--color-primary, #3b82f6)`           |
| 边框     | `border: 1px solid #e2e8f0` | `border: 1px solid var(--color-border, #e2e8f0)` |
| 卡片底    | `background: #fff`          | `background: var(--color-bg-card, #ffffff)`      |

**只有以下情况可保留字面色**（它们本就不该跟随主题）：

- 分类/状态语义色（成绩等级、进货/出库三色、倒计时紧迫度、性别徽章等刻意区分色）
- 图表 / canvas / SVG 的 fill、stroke
- `linear-gradient` / `radial-gradient` 的色标
- 彩色实底上的白色前景字（`color:#fff` 配彩色底）
- **`<script>` 内导出的 HTML/Excel 字符串**——CSS 变量在其中不解析，替换会导致底色丢失
- 暗色模式专用手调色板（被 `html.dark` 包裹的刻意高对比组合）

> **判断标准**：切换主题色时，这个颜色**该不该跟着变**？该变 → 用 token；不该变 → 保留。

---

## 2. 组件规范

### 2.1 按钮（`.ui-btn` 体系）⭐

**唯一按钮基类**：`src/style.css` 的 `.ui-btn`。基类样式（inline-flex、min-height 36px、padding 8px 14px、1px 边框、`--radius-md` 8px、`--font-size-sm`、transition）**已包含全部旧 class 别名**，因此历史 class 无需改名即可统一。

#### 语义变体

| 语义                      | 使用 class                                                                                                                                                                                    | 视觉                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **主操作**（提交/保存/新增/确认/应用） | `.ui-btn--primary`、`.btn-submit`、`.btn-add`、`.btn-primary`、`.confirm-btn`、`.add-btn`、`.nav-add-site`、`.ob-btn-primary`、`.bs-btn-primary`、`.btn-save`、`.pwd-btn-primary`、`.tw-btn-primary` … | 主色底 + 白字 + 主色边框；hover 加深 + 上浮 + 阴影         |
| **危险**（删除/清空）           | `.ui-btn--danger`、`.btn-delete`、`.btn-clear`、`.btn-danger`、`.site-action-btn.danger`                                                                                                        | 红字透明底红框；hover 红软底                          |
| **次要/取消/关闭/重置**         | `.ui-btn`、`.btn-cancel`、`.cancel-btn`、`.btn-edit`、`.btn-secondary`、`.btn-help`、`.bs-btn`、`.wb-btn`、`.st-btn` …                                                                              | 卡片面 + 边框 + 次文字；hover 主色描边                  |
| **成功/上传**               | `.ui-btn--success`、`.upload-btn`、`.btn-fetch`                                                                                                                                               | 成功绿底白字                                     |
| **文字按钮**                | `.ui-btn--text`                                                                                                                                                                             | 透明底；hover 主色软底                             |
| **小尺寸**                 | `.ui-btn--sm`（叠加在上述任一之上）                                                                                                                                                                    | min-height 30px / padding 5px 10px / 字号 xs |
| **图标关闭**                | `.close-btn`                                                                                                                                                                                | 32×32 方块，1px 边框 + 8px 圆角；hover 主色          |

禁用态统一 `opacity: 0.5; cursor: not-allowed`；`:active` 统一 `--motion-press`。

#### ⚠️ el-button 主操作必须纳入全局组

```vue

<el-button class="btn-save">保存</el-button>


<el-button class="my-save-btn">保存</el-button>
```

**原理**：`<el-button>` 未加 `type="primary"` 时，EP 按默认按钮渲染，hover 背景为  
`--el-fill-color-light`（灰）。若 scoped 又设了 `color:#fff`，就会出现**白字压灰底**。  
把 class 纳入全局 `.ui-btn--primary` 组后，全局 hover 规则（特异性 0,3,0）稳定覆盖  
`.el-button:hover`（0,2,0），保证 hover 恒为主色深底 + 白字。

> 若新增主操作 class，**必须**同步登记到 `style.css` 的 `.ui-btn--primary` 组及其 `:hover` 组。

### 2.2 弹框（`BaseDialog`）⭐

**唯一弹框基类**：`src/components/common/BaseDialog.vue`。  
所有弹框**必须**基于它，**禁止**自建 `.xxx-overlay` + `.xxx-modal` 外壳。

#### API

| Prop             | 默认        | 说明                                                  |
| ---------------- | --------- | --------------------------------------------------- |
| `title`          | `''`      | 头部标题                                                |
| `width`          | `'480px'` | 面板最大宽度；可传 `var(--dlg-w-xxx, 700px)`                 |
| `maxHeight`      | `'80vh'`  | 面板最大高度                                              |
| `embedded`       | `false`   | 嵌套模式：不渲染遮罩、不固定定位，随父弹框流式排布                           |
| `hideHeader`     | `false`   | 隐藏头部（`embedded` 子面板通常传 `true`）                      |
| `fullscreen`     | `false`   | 全屏模式：遮罩内边距归零、面板铺满视口、无圆角阴影                           |
| `closeOnEscape`  | `true`    | ESC 是否触发关闭。需自定义 ESC 分层行为（如"全屏态先退出"）时置 `false` 并自行处理 |
| `closeOnOverlay` | `true`    | 点遮罩是否关闭                                             |

| Slot      | 用途                                   |
| --------- | ------------------------------------ |
| 默认        | 主体内容，自动包 `.bd-body`（统一 padding + 滚动） |
| `#title`  | 自定义标题（可含 `<Icon>`）                   |
| `#footer` | 底部操作区，自动包 `.bd-footer`（flex 右对齐）     |
| `#panel`  | **整体覆盖**（默认外壳不适用时才用）                 |

事件：`close`（遮罩点击 / ESC / 关闭按钮均触发）。自带 ESC 关闭、暗色与 accent 跟随、移动端适配。

#### 标准用法

```vue
<script setup lang="ts">
import BaseDialog from '@/components/common/BaseDialog.vue'
</script>

<template>
  <BaseDialog title="编辑网站" :width="'var(--dlg-w-site, 864px)'" @close="onClose">
    <form @submit.prevent="onSave"> ... </form>

    <template #footer>
      <button class="btn-cancel" @click="onClose">取消</button>
      <button class="btn-submit" @click="onSave">保存</button>
    </template>
  </BaseDialog>
</template>
```

#### 约定

- **响应式尺寸走 CSS 变量**：弹框宽高由 `settings.ts` 注册的 `--dlg-w-*` / `--dlg-h-*` 控制，    
  BaseDialog 通过 `:width` / `:max-height` 接收，**不要**在组件里写死像素。
- **`embedded` 子面板**：`:embedded="embedded"` + `:hide-header="embedded"` +    
  `:close-on-overlay="!embedded"`；组件内**不要**再自行监听 ESC（基类已统一处理）。
- **例外**：业务上**刻意无关闭按钮**的弹框（如 `CloudSyncConflictModal` 四选一裁决），    
  用 `#panel` 插槽接管内部结构，并设 `:close-on-overlay="false"`。
- **需要叠层更高**的弹框（图标选择器 400 / 冲突 9999 / PIN 3000），    
  用组件自身 class 局部提升 z-index，**不要改 BaseDialog 源码**。
- **确认框**：不要用 `ElMessageBox` 或原生 `confirm()`；用 `utils/dialog.ts` 的 `showConfirm(message, title?)`    
  （底层 = `useConfirm` 单例 + `ConfirmHost` + `BaseDialog`）。返回 `Promise<boolean>`，取消/关闭均为 `false`。    
  宿主 `ConfirmHost` 已在 `App.vue` 挂载，**勿重复挂载**。
- 新增弹框时同步登记 `src/utils/scrollLock.ts` 的遮罩白名单（`.bd-overlay` 已在其中）。

### 2.3 输入框

优先级：

1. **业务表单** → `el-input` / `el-select` / `el-form-item`（项目**全量导入** EP，无需手动 import）
2. **EP 不支持的类型**（`file` / `color` / `range` / 日期等）→ 原生控件 + **`.ui-input`** 类
3. **禁止**自造 `.custom-input` 之类的私有输入样式

```vue

<input class="ui-input" type="text" v-model="url" />


<div class="my-input"><input /></div>
```

### 2.4 卡片

**先辨明类别，再选类名。** 项目里的 "card" 是**一组结构与语义都不同的组件**，不是同一个东西的统一实现，**不可机械改名/合并**（实测：`.ewt-card-grid` 只是 `align-content` 的布局容器，加边框阴影会破坏布局；`.tw-card` 带 title/hint 子元素与 16px 内边距，与 `.ui-card` 的无内边距纯表面不同）。

| 类别                 | 现有类名                                         | 特征                                                            | 能否互换              |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------- | ----------------- |
| **通用卡面**           | `.ui-card`                                   | 纯表面：1px 边框 + `--radius-lg` + 卡面底 + `--shadow-card`，hover 主色描边 | —                 |
| **面板卡**（带标题/提示子元素） | `.tw-card`（教师）、`.panel-scope .stat-card`（个人工作台，取值与 `.tw-card` 相同） | 16px 内边距、圆角 12px、标题带 4px 主色竖条（`::before`）、极轻阴影 | ❌ 与 `.ui-card` 不同 |
| **统计卡**（大数字+标签）    | `.bento-card`、销售/学生台各自的 `*-stat-card` | flex 列 + gap 16px、圆角 8px                                      | ❌ 与面板卡不同          |
| **销售台分区卡**        | `.bizhome-card` / `.bizhome-today` / `.bizprod-card` / `.bizstats-card` / `.bizrec-card` / `.bizinv-card` 等 | 16px 内边距、圆角 12px、极轻阴影（圆角/阴影由 `workbench.css` 统一压制，组件里仍是 8px） | ❌ 与 `.ui-card` 不同 |
| **网格/列表布局容器**      | `.ewt-card-grid`                             | 只有 `align-content`，**无表面**                                    | ❌ 不是卡片            |
| **工具箱卡片**          | `.tu-card`（含 `-title`/`-value`）              | toolbox 独立体系                                                  | ❌ 见 §4.1 边界       |

> **个人工作台已收口；销售台同源**：12 个（个人）/ 8 个（销售）面板原先各抄一份 `.stat-card` 与各自的**
> **`*-card`，同一段 CSS 逐字节复制多份。现统一到 `src/styles/workbench.css`，作用域标记为 `.panel-scope`
> （`<main class="wb-content panel-scope">` / `<main class="bs-content panel-scope">`）。
> 面板内**不要**再新增 `.stat-card` / `.stat-header` / `.stat-label` / `.stat-value` 的 scoped 副本
> ——scoped 规则在构建时后注入，会盖掉全局值，等于又开一条轨道（详见该文件头注释）。
> 例外：销售台分区卡的圆角/阴影是 `.bs-content.panel-scope .bizxxx-card` 叠三段选择器压制的
> （组件里仍是 8px 且无阴影），改组件那行时记得同步删掉这里的压制，否则会「改了没反应」。

**规则**：

- 新增**通用卡面**（无特殊子元素/尺寸）→ 用 `.ui-card`
- 新增**带标题的卡 / 统计卡 / 网格容器** → 参照对应现有类的结构，**不要硬套 `.ui-card`**
- **禁止**为同一语义另造第二套（这才是双轨道）；但**不同语义各用自己的类不是双轨道**
- 卡面视觉走 token：圆角 `--radius-*`、阴影 `--shadow-card`/`--shadow-card-hover`、背景 `--color-bg-card`/`--color-surface`；**禁止**硬编码 `box-shadow: 0 1px 2px rgba(...)` 这类值
  - **唯一例外**：`.tw-card` / `.panel-scope .stat-card` / `.bs-content.panel-scope .biz*-card` 的
    `box-shadow: 0 1px 2px rgba(15,23,42,0.04)`
    （工作台与销售台共用的「极轻卡面」值，比 `--shadow-card` 明显更淡，直接写死以便多处逐像素一致；改一处必须同步其它处）

### 2.5 图标 / 关闭按钮

- 关闭按钮统一 `.close-btn`（32×32），**不要**自定义尺寸
- 图标统一用 `<Icon name="..." />`，图标资源放 `public/icons/`

### 2.6 z-index 分层

| 层级          | 值                 | 说明            |
| ----------- | ----------------- | ------------- |
| app-bar     | 100               | 顶部栏           |
| panels      | 250               | 工作台面板         |
| **dialogs** | **300**           | BaseDialog 默认 |
| 特殊弹框        | 400 / 3000 / 9999 | 组件 class 局部提升 |

> `style.css` 另有 `--z-dropdown/modal/tooltip/overlay`（100/200/300/400），>   
> 但 **BaseDialog 实际固定 300**，以本表为准；特殊叠层用组件 class 覆盖。

---

## 3. 代码风格

### 3.1 组件与类型

- 一律 `<script setup lang="ts">`（Composition API，**禁止** Options API）
- **TypeScript Strict + `noUnusedLocals` + `noUnusedParameters`** —— 不得有未使用的变量/函数/import
- 路径别名 `@/` → `/src`，**不要**用 `../` 相对路径
- npm only

### 3.2 命名

| 对象          | 约定                                 | 示例                                                            |
| ----------- | ---------------------------------- | ------------------------------------------------------------- |
| 组件文件        | PascalCase 单文件                     | `BaseDialog.vue`                                              |
| 事件处理函数      | `handleXxx`（`on` 前缀仅用于明确的"外部事件回调"） | `handleSave`、`handlePageClick`                                |
| Props/Emits | camelCase                          | `isAllMode`                                                   |
| 布尔 prop     | 语义肯定式                              | `embedded`、`hideHeader`                                       |
| **CSS 类**   | **语义化 kebab，优先用全局类**；**禁止新增功能前缀类** | ✅ `.ui-card`、`.category-list`；❌ `.wb-xxx`、`.st-xxx`、`.bs-xxx` |

> **存量前缀类**（`.wb-*` / `.st-*` / `.bs-*` / `.sa-*` / `.sp-*` / `.ipd-*` / `.dm-*` / `.djm-*` / `.sth-*` / `.nsf-*` / `.bizpur-*` 等）>   
> 是历史分层，**已通过全局别名映射统一视觉**。为避免大范围回归**不强制重命名**，>   
> 但**新代码不得引入**此类前缀。

### 3.3 样式写法

- `<style scoped>` + CSS 变量；**不使用** `<style>` 全局（全局只放 token 与基础类）
- 颜色 / 间距 / 圆角 / 阴影 / 动效 → **一律走 token**（§1）
- 布局数值（padding/margin/gap/width…）→ 新代码优先 `var(--space-*)`；    
  存量不强改，但**同一组件内不得混用**裸 px 与 token
- **不要**写 `!important`（确需覆盖第三方如 EP 时，限定到具体选择器并注释原因）
- 响应式断点：移动端 `max-width: 768px`（与既有 `@media` 一致）

### 3.4 Element Plus

- **全量导入**（`main.ts` 中 `app.use(ElementPlus, { locale: zhCn })`），**无需**逐组件 import
- el-button 圆角/高度已由 `styles/element-theme.css` 对齐项目规范（8px / 36px，small/large 除外）


### 3.5 提交前强制检查

```bash
npm run typecheck   # vue-tsc -b —— 类型检查（注意：npm run build 不含此步）
npm run lint        # ESLint —— 代码正确性
npm run build       # generate-preset-icons + vite build —— 生产构建
```

**必须 0 类型错误 + 0 lint error + 构建通过**才可提交。

> ESLint（`eslint.config.js`，flat config）只管**正确性**（重复键、不可达分支、computed 副作用、>   
> 模板结构错误等），**刻意不引入 Prettier**、不启用 vue 格式类规则——全库重排会产生与治理无关的>   
> 巨大 diff。存量问题（如 `any`）降级为 warning 供持续跟踪，不阻塞构建。

> ⚠️ **构建通过 ≠ 视觉正确**。样式类改动（尤其颜色、层叠、hover）**必须浏览器抽检**：>   
> 至少检查 ① 亮/暗色 ② 切换 3 套以上 accent 主题 ③ hover/disabled 态 ④ 弹框开关与嵌套。>   
> 历史教训：`btn-save` hover 灰底白字、4 处弹框 z-index 降级，均为构建无法捕获的问题。

- **禁止手改 `src/composables/presetIcons.ts`**（build 自动生成，仅时间戳变化时 `git checkout` 还原）
- 提交信息用中文，`fix-` / `feat-` / `style(color):` 等前缀

---

## 4. 项目结构

```
src/
├── components/
│   ├── common/          # 跨模块通用基组件（BaseDialog 等）← 新增通用组件放这里
│   ├── business/        # 销售记账模块
│   ├── student/         # 学生工作台模块
│   ├── teacher/         # 教师工作台模块
│   ├── workbench/       # 个人工作台模块
│   └── *.vue            # 跨职能组件（AppSettingsDialog / SiteCard / Toast / GlobalSearch …）
├── views/               # 页面级组件（HomeView / WorkbenchView / BusinessView / StudentView / TeacherView）
├── composables/         # 可复用逻辑（use*）
├── stores/              # Pinia（域状态）
├── utils/               # 纯函数工具（dialog / scrollLock / idb …）
├── styles/              # element-theme.css / dark.css / themes.css
├── toolbox/             # 工具箱（自带独立 token 体系 tool-ui.css，勿与 src token 混用）
└── style.css            # Design Token + 全局基础类（.ui-btn / .ui-card / .ui-input / .close-btn）
```

**归类规则**：

- 只服务单一模块 → 放该模块子目录
- 跨模块复用 → `components/common/`
- 页面级容器 → `views/`
- 组件内私有样式 → 组件内 `<style scoped>`；**跨组件共享** → 提到 `style.css`

### 4.1 toolbox 边界（重要）

`src/toolbox/` 是**独立子体系**，其工具页面自有一套紧凑视觉（`toolbox/styles/tool-ui.css`）。

- ✅ **允许**：toolbox 内部自行使用 `tool-ui.css` 的类与尺寸（工具箱控件密度与主应用不同，强行统一会破坏工具可用性）
- ❌ **禁止**：把 toolbox 的类名/样式搬进 `src/style.css`，或让 toolbox 依赖 `BaseDialog`/`useConfirm` 等主应用组件
- toolbox **新增工具时**：先查 `toolbox/components/` 是否已有同类工具壳（`TuCard`/`TuDialog` 等），复用之
- toolbox 与主应用**唯一共享**的是 `docs/` 与 `Icon` 等极少数公共资源

> 换言之：`src/style.css` 的 token 与 `.ui-*` 基类**只服务主应用**（导航站 + 三个工作台），不覆盖 toolbox。

---

## 5. 禁止双轨道（最重要）

以下都是**已发生过的真实分裂**，务必避免重演：

| 双轨道   | ✅ 唯一实现                                                        | ❌ 禁止                                |
| ----- | ------------------------------------------------------------- | ----------------------------------- |
| 按钮    | `.ui-btn` 全局体系 + 别名映射                                         | 各组件自建 `.my-btn` 视觉                  |
| 弹框    | `BaseDialog`                                                  | 自建 `.xxx-overlay` + header + footer |
| 确认框   | `showConfirm()` → `useConfirm` + `ConfirmHost` + `BaseDialog` | 原生 `confirm()`、`ElMessageBox`       |
| 提示    | `useToast`（自研 Toast）                                          | 混用 `ElMessage` / `alert()`          |
| 输入框   | `el-input` / `.ui-input`                                      | 自造 `.custom-input`                  |
| 分页    | `usePanelPaging` + `PanelPager` / `el-pagination`             | 各面板自写分页公式                           |
| 颜色    | `var(--color-*)` token                                        | 裸 `#3b82f6`                         |
| 弹框滚动锁 | `utils/scrollLock.ts` 白名单                                     | 各自实现 body 锁滚                        |

**发现双轨道时的处理**：不要新增第三套；而是把**多数派**收敛到既有基类，或扩展基类以覆盖新场景。

---

## 6. 新增 UI 的标准流程

1. **搜索**：项目里是否已有同类实现？（`grep` 组件名 / class 名）
2. **有** → 直接复用，按本文档规范调用
3. **无** → 评估能否用现有基类 + token 组合出来；能 → 用基类
4. **确需新组件** → 放 `components/common/`，接入 `style.css` token 体系，**不**在业务组件里局部造样式
5. **验证**：`npm run build` + 浏览器抽检（亮/暗色 + 多 accent + hover/disabled）

---

## 7. 反模式清单

| ❌ 禁止                                            | 原因                                       |
| ----------------------------------------------- | ---------------------------------------- |
| 自建弹框外壳（overlay + header + close + body）         | 已有 `BaseDialog`；重复实现导致样式分裂               |
| 按钮 scoped 里重定义视觉                                | scoped 特异性更高，会覆盖全局基类，破坏统一；应删 scoped 只留布局 |
| 主操作 el-button 不加 `type="primary"` 且 class 不在全局组 | hover 透出 EP 灰底 → 白字不可读                   |
| 裸写 `#3b82f6` / `#e2e8f0` / `#64748b`            | 切换 accent 主题时不变色                         |
| 裸写间距 `14px` 而非同族 token                          | 间距体系分裂                                   |
| 新增 `.wb-` / `.st-` / `.bs-` 类前缀                 | 历史分层，新代码不应延续                             |
| 复制邻近组件的样式块                                      | 应提取为基类或 token                            |
| 手改 `presetIcons.ts`                             | build 自动生成                               |
| 提交前只看构建通过就合入                                    | 样式/层叠问题构建抓不到，必须浏览器抽检                     |
| 在 `<script>` 导出的 HTML 字符串里用 CSS 变量              | Excel/HTML 不解析变量，会丢样式                    |

---

## 8. 已知技术债（整改后剩余项，勿盲目自动化）

以下为 2026-10 整改后仍存在的项。**均需浏览器验证后再动**，构建通过不代表安全。

| 项                                                                   | 现状                                                                                                                                                                                                                                                                                                                                                   | 评估                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`AppSettingsDialog` 未迁移到 `BaseDialog`~~                           | **已迁移**（2026-10）：外壳换为 `BaseDialog`，面板 90vw×90vh 经 props 传入，全屏态由基类 `fullscreen` 接管；`IconPickerDialog`/`CloudSyncConflictModal` 移到基类之外（避免被 `.bd-body` 滚动容器裁剪）；ESC 分层（全屏先退出）经 `close-on-escape=false` + 组件自有 `handleKeydown` 保留                                                                                                                         | —                                                                                                                                                                                                                                                                                               |
| `LedgerSwitcher`(workbench) / `BusinessLedgerSwitcher`(business) 两份 | 行数相近但数据源不同（个人账本 vs 销售账本）                                                                                                                                                                                                                                                                                                                             | 中风险，需先抽象数据契约再合并                                                                                                                                                                                                                                                                                 |
| `SpotlightOverlay` / `BusinessSpotlightOverlay` 两份                  | **实测 diff 822 行**，`SpotlightData+searchAll` vs `BizSpotlightData+searchBizSpotlight`，逻辑差异大                                                                                                                                                                                                                                                           | **非机械重复**，合并属真实重构，收益有限                                                                                                                                                                                                                                                                          |
| 4 个 select 薄封装                                                      | 仅 `ExamNameSelect.vue` / `TagFilter.vue` 存在（`SubjectSelect`/`CommitteeRoleSelect` 实际不存在）                                                                                                                                                                                                                                                             | 可用泛型 `<EntitySelect :options>` 收敛，低风险                                                                                                                                                                                                                                                           |
| 业务表单裸 `<input>` 未换 `el-input`                                       | **主应用已收敛**（2026-10）：`SiteModal`（最高频表单）+ `BusinessView` 账本创建门已迁移；学生/工作台/销售面板原本已是 el-*                                                                                                                                                                                                                                                                 | ⚠️ 换 `el-input` 会改变 DOM，原按元素名的样式选择器会失配——**必须逐文件迁移 + 目视验证**。迁移三步：① 裸控件换 `el-input`/`el-select`（`type="textarea"` 覆盖 textarea）；② 删除按元素名（`input`/`textarea`/`select`）的视觉样式，改由组件自带或 `.ui-input` 承担；③ 布局规则补 `.el-input`/`.el-textarea`/`.el-select`，错误态用 `is-error` + `:deep(.el-input__wrapper)` 兜底 |
| ⚠️ 教师模块表单体系（`.tw-input`/`.tw-select`）                               | **已迁移完毕**（2026-10）：14 个教师组件 + `TeacherView.vue` 共 **64 个控件**全部转为 `el-input`/`el-select`/`el-date-picker`/`el-time-picker`；`teacher.css` 中 `.tw-input`/`.tw-select`/`.tw-input-sm` 及其移动端媒体查询已删除                                                                                                                                                       | 迁移中修正一处**高危隐患**：`el-input` 的 `@change` 抛出的是**值本身**而非 DOM 事件，原有 15 处 `($event.target as HTMLInputElement).value` 若照搬会静默得到 `undefined`（输入即清空），已全部改为 `(val: unknown) => …String(val ?? '')`。⚠️ 控件尺寸变小（30px/12px → 24px/12px），密集表格行高收紧，需目视确认                                                        |
| ⚠️ iOS 聚焦缩放（迁移副作用，待决策）                                              | 教师模块原有 `@media (max-width:768px)` 规则把 `.tw-input` 提到 44px/16px 以**防 iOS Safari 聚焦时自动放大页面**；迁移到 `el-input size="small"`（内部 input 12px）后该保护在教师模块消失                                                                                                                                                                                                     | 这是 **el-* 全站共有的既存缺&#x53E3;**（学生/工作台的 el-input 一直缺此保护），非迁移独有。**&#x4E0D;建议直接在 `teacher.css` 补 `.el-input` 规则\*\*——teacher.css 规则加载后即全局生效，会把全站 el-input 在移动端放大到 16px，撑破学生/工作台密集表格。彻底修复需在 `mobile.css` 统一处理并做移动端回归验证                                                                                |
| ⚠️ 迁移易踩坑                                                            | —                                                                                                                                                                                                                                                                                                                                                    | **`el-input type="textarea"` 的根类名是 `.el-textarea`，不是 `.el-input`**；`el-select` 是 `.el-select` 且 EP 下为 `inline-block` 不自带 `width:100%`。只写 `.el-input { width:100% }` 会漏掉这两者，导致**宽度与其它输入框不一致**。布局规则需同时覆盖 `.el-input` / `.el-textarea` / `.el-select` 三种类名                                         |
| ~~存量 `.card` / `.wb-*` / `.st-*` 等历史类名~~                            | **已结案**（2026-10）：核实后发现"card"类名是**一组结构/语义不同的组件**（面板卡 / 统计卡 / 网格容器 / toolbox 卡），**不是同一组件的多套实现**，机械改名会造成破坏（`.ewt-card-grid` 会被加边框、`.tw-card` 会丢内边距）。已在 §2.4 补齐分类表与选用规则。真正值得统一的**圆角 token 兜底值漂移已修复**：152 处 `var(--radius-md, 10px)` 之类的假兜底统一对齐到 `:root` 定义（视觉零变化，因为 token 恒存在，但消除了"同一 token 并存 3–4 个值"的规范分裂）。遗留 3 处 `var(--radius-lg, 14px)` 待你确认是否为有意取值 | `.ui-card` 目前**零组件采用**（仅规范中定义），作为"通用卡面"的预留原语保留；若长期无人使用可考虑从规范中移除，避免"死规范"误导                                                                                                                                                                                                                       |
| ~~开关双轨~~                                                            | **已收敛**（2026-10）：`AppSettingsDialog` 内 12 处自定义 `.switch-btn` 全部改为 `el-switch`，`.switch-btn`/`.switch-thumb`/`.mini-switch` 样式（含 dark 变体）已删除，代码零残留                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                               |
| ~~无 ESLint / Prettier~~                                             | **ESLint 已接入**（2026-10）：`npm run lint` / `lint:fix`，只管正确性、不做格式                                                                                                                                                                                                                                                                                       | 存量 96 处 `any`、9 处 computed 副作用为 warning，可随重构逐步收敛；Prettier 仍**刻意不引入**                                                                                                                                                                                                                            |
| toolbox 与 src 双 token 树                                             | `toolbox/` 自带 `tool-ui.css`                                                                                                                                                                                                                                                                                                                          | 建议保持独立（工具箱视觉自成体系），仅在文档标明边界                                                                                                                                                                                                                                                                      |
| ~~销售台面板视觉与教师台不一致~~ | **已收敛**（2026-10-29）：`workbench.css` 作用域由 `.wb-content` 泛化为标记类 `.panel-scope`，销售台 `<main class="bs-content panel-scope">` 直接复用同一套卡片/竖条/胶囊按钮/表格原语；内容区 padding 20→16px、`.bs-header` 12px 16px、`.bs-menu-item` 对齐 `.tv-nav-item`（9px 10px / 4px 圆角 / hover 只换底不换字色）；8 个面板补「标题 + 一行说明」页头（文案来自 `SECTIONS.hint`，与左树/搜索浮层同源）；`BusinessHome` 删掉从未挂载的 `.stat-*` 死代码，`.bizhome-card` 圆角 8→12px + 极轻阴影、卡片标题补 4px 主色竖条；6 类分区卡（商品/统计/对账/库存预警/今日/引导）圆角阴影统一到 12px | 顺带修掉一个**存量崩溃**：库存表「一天一父行 + 明细子行」的父行没有 `productId/unitPrice/total`，明细列却照样渲染 → `formatYuanOf(undefined).toFixed` 抛 TypeError，打断整页 patch（现象是**后续面板出现上一个面板的残留 DOM**，报错栈还指向下一次渲染，极难定位）。已按行类型 `isDayRow()` 判定，父行只留日期/笔数/当天合计，操作列也不出现在父行（父行 id 是 `day-xxx`，误点会用假 id 写库）；连带补 `default-expand-all`（否则默认折叠，桌面端每天只剩一行空壳）与页内连续序号。新增 `scripts/qa-biz-purchases-tree.mjs`（15 断言）守住这条链路 |
| ~~个人工作台面板视觉与教师台不一致~~                                              | **已收敛**（2026-10-29）：新增 `src/styles/workbench.css`（全部选择器限定 `.wb-content`），把教师台的卡片/标题竖条/统计数字/胶囊按钮/表格取值落成一套原语；删除 6 个面板里逐字节重复的 `.stat-card/.stat-header/.stat-icon/.stat-label`（共 260 行）；面板补「标题 + 一行说明」页头；内容区 padding 20→16px 对齐 `.tv-content` | 两处**有意的局部差异**（已被面板 scoped 规则显式覆盖并写明原因）：① 记账 7 列统计卡保留正文色数字（红=支出，染主色会误读）；② 首页 6 列密集小卡不挂标题竖条（会把标题挤成省略号）。另修掉一处存量 bug：`.btn-primary` 等别名直接写 `background-color`，对 el-button 无效（被 EP 的 `--el-button-bg-color` 压掉），表现为主操作按钮全成白底描边——已在 workbench.css 用 EP 变量覆盖 |

---

## 9. 相关文件索引

| 主题                      | 文件                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Token 定义 / 按钮基类 / 全局基础类 | `src/style.css`                                                                                                             |
| 主题（7 套 accent）          | `src/styles/themes.css`                                                                                                     |
| 暗色                      | `src/styles/dark.css`                                                                                                       |
| EP 桥接 + el-button 尺寸对齐  | `src/styles/element-theme.css`                                                                                              |
| 教师工作台面板原语（tw-*）        | `src/styles/teacher.css`                                                                                                    |
| 工作台面板原语（个人 + 销售共用，`.panel-scope` 作用域，取值同 tw-*） | `src/styles/workbench.css`                                                                                      |
| 弹框基类                    | `src/components/common/BaseDialog.vue`                                                                                      |
| 确认框 / 提示                | `src/utils/dialog.ts`、`src/composables/useConfirm.ts`、`src/components/common/ConfirmHost.vue`、`src/composables/useToast.ts` |
| 弹框滚动锁白名单                | `src/utils/scrollLock.ts`                                                                                                   |
| 数据层 / 业务约定（另一份）         | 根目录 `AGENTS.md`                                                                                                             |

---

*最后更新：2026-10-29 · 对应整改批次：按钮统一 → BaseDialog 基类 → 21 个弹框迁移 → 196 处配色 token 化 → 个人工作台对齐教师工作台视觉*
