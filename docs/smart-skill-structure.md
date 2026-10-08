# 智能工作台 · 技能（Skill）数据结构规范 v2

> 本文定义「一个技能」的物理结构与字段映射，是创建 / 编辑 / 上传 / 下载四处的唯一依据。
> 旧版把技能当成「一条带标题的文本」，不符合"技能 = 一个目录"的真实形态，v2 起按目录建模。

---

## 1. 物理结构：一个技能 = 一个目录

```
my-skill/                  ← 技能根目录（目录名仅作容器，不参与数据）
├── skill.md               ← 【必需】核心文件：YAML frontmatter 元数据 + 正文指令
├── scripts/               ← 【可选】可执行脚本
│   ├── fetch_data.py
│   └── check.sh
├── templates/             ← 【可选】输出模板
│   └── report.md
└── reference/             ← 【可选】参考文档（可为二进制：pdf/xlsx/png…）
    └── spec.pdf
```

规则：
- **必须有 `skill.md`**，否则不是一个合法技能（上传时明确报错）。
- 其余文件**原样保留相对路径**（`scripts/fetch_data.py`），不改名、不压平。
- 导入时**剥掉最外层文件夹名**（用户选的就是那个容器目录），导出时以**技能名称**重建顶层目录。

---

## 2. skill.md 结构

```markdown
---
name: 需求文档生成
description: 把一句话想法展开为结构化需求文档
version: 1.0.0
author: 张三
category: 写作
tags: [产品, 文档]
when_to_use: 需要产出需求文档、PRD、功能说明时
tools: [search, file_read]
license: MIT
---

# 工作流程

1. 先确认目标用户与场景
2. 按「背景 / 目标 / 用户故事 / 功能需求 / 验收标准」输出
```

- `---` 之间为 **frontmatter（YAML 子集）**，之后全部为**正文（body）**。
- 正文中可用 `{{变量}}` 占位（沿用提示词那套变量语法，便于复用填充能力）。

---

## 3. 字段映射表（skill.md ⇄ 界面 ⇄ 存储）

| frontmatter 键 | 数据字段 | 必需 | 默认值 | 界面控件 | 说明 |
|---|---|---|---|---|---|
| `name` | `name` | **✓** | — | 单行输入 | 技能名，库内唯一；也是导出目录名 |
| `description` | `description` | **✓** | — | 多行输入 | 一句话说明，列表副标题 |
| `version` | `version` | | `1.0.0` | 单行输入 | 语义化版本 |
| `author` | `author` | | `''` | 单行输入 | 作者 / 来源 |
| `category` | `category` | | `未分类` | 下拉 + 可新建 | 用于分组筛选 |
| `tags` | `tags: string[]` | | `[]` | 标签输入 | 最多 8 个 |
| `when_to_use` | `whenToUse` | | `''` | 多行输入 | **适用场景 / 触发条件**（决定何时调用该技能） |
| `tools` | `tools: string[]` | | `[]` | 标签输入 | **依赖工具**（如 search / file_read） |
| `license` | `license` | | `''` | 单行输入 | 授权 |
| 其它未识别键 | `extra: Record<string, unknown>` | | `{}` | 只读展示 | **原样保留**，导入导出不丢 |
| `---` 之后全文 | `body` | **✓** | `''` | 大文本域 | 技能指令正文 |
| 同级目录其它文件 | `resources[]` | | `[]` | 资源树（可删） | 见下 |

**必需只有三个**：`name`、`description`、`body`。缺失即拒绝导入 / 拒绝保存，并**指明具体字段名**。

---

## 4. 资源模型

```ts
interface SmartSkillResource {
  path: string            // 相对路径，如 scripts/fetch_data.py
  size: number            // 字节
  encoding: 'text' | 'base64'
  data: string            // text 直接存字符串；二进制存 base64
}
```

- **判定**：扩展名命中文本白名单（md/txt/json/yaml/yml/py/js/ts/sh/csv/html/css/sql…）或能被 UTF-8 无损读出的 → `text`；其余 → `base64`。
- **上限**：单文件 ≤ 1 MB，单技能资源总数 ≤ 50、总字节 ≤ 5 MB。超限文件**跳过并明确提示**（不静默丢、也不整体失败）。
- **UI**：详情与编辑页以目录树列出，可单独删除；不提供在线编辑二进制内容。

---

## 5. 上传（文件夹 / zip）

```
选择文件夹（webkitdirectory）或 .zip
  → 扫描全部文件，递归找出所有 skill.md
  → 每个 skill.md 各成一个技能，其所在目录即该技能的根目录
  → 解析 frontmatter（YAML 子集：标量 / 引号串 / 行内数组 / 块数组 / 注释）
  → 校验必需字段：缺 skill.md / YAML 解析失败 / name / description / body 缺失 → 明确报错并指明位置
  → 其余文件按「路径最长匹配」归属到对应技能，路径相对该技能根目录
  → 预览「新增 N / 更新 M / 跳过 K」+ 解析提示（失败项 / 超限资源 / 游离文件）→ 确认落库
```

因此三种常见选择方式都能正确处理：
1. 直接选中技能目录（`my-skill/` 内含 `skill.md`）→ 导入 1 个技能
2. 选中父目录（下面多个技能子目录）→ 批量导入 N 个技能
3. 选中 zip（含顶层目录）→ 同上，一视同仁

- 嵌套技能（技能目录里还有 `demo/skill.md`）各自独立，资源归**最深**的那个 `skill.md` 所有。
- 不属于任何技能目录的文件计入「游离文件」，在预览里提示已忽略。
- 同名技能按 `updatedAt` 新者胜（与现有导入策略一致）。

## 6. 下载（zip）

```
单个技能 → <技能名>.zip
  顶层目录 <安全化后的技能名>/
    ├── skill.md      ← frontmatter + body 重新生成
    └── 资源按原路径还原

全部技能 → smart-skills-<日期>.zip（多个技能目录并列）
```

**导出即可再导入**：zip 解包 → 目录 → skill.md + 资源，与上传路径完全对称，闭合验证。

---

## 7. 旧数据迁移

v1 的技能是扁平结构（`name/description/content/icon/…`），v2 读取时自动迁移：
- `content` → `body`
- `name/description/version/author/category/tags` → 对应字段
- `icon` → 落入 `extra.icon`（v2 无图标字段，界面用统一图标）
- `resources` 缺省 `[]`
迁移在 `normalizeSkill` 内完成，**幂等**（已是 v2 结构则原样返回）。
