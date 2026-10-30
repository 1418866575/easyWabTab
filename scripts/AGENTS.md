# scripts/ — Build & Serve Helpers

## OVERVIEW

4 helper scripts + 31 pure-function test runners (`node --experimental-strip-types`，其中 15 个学生 core 测试需 extensionless loader) + 1 Playwright UI QA。
一次性 Playwright QA 脚本（`qa-*.mjs` ×36）与已废弃的 IDB 版本校验脚本（`check-idb-v4/v8.ts`）已于开源清理中移除。

**关键：学生 core 测试（test:student-*）必须带 `--experimental-loader ./scripts/resolve-extensionless.mjs`**
（学生 cores 用无扩展名 `./countdownCore` 相对导入 + `@/` 别名，纯 `node --experimental-strip-types` 会
`ERR_MODULE_NOT_FOUND` / `ERR_UNSUPPORTED_DIR_IMPORT`）。

## STRUCTURE

```
scripts/
├── generate-preset-icons.cjs # Build-time: scans public/icons/ → generates src/composables/presetIcons.ts
├── serve-with-rewrites.cjs   # Custom HTTP server: serves dist/ + game rewrites + SPA fallback + WebDAV 代理（内置，端口 16718）
├── webdav-proxy-only.cjs     # 独立 WebDAV 同源代理（Nginx 静态托管时用，端口 16719；npm run webdav-proxy）
├── statsService.cjs          # 全网访问统计的采集/聚合逻辑（纯 CJS；JSON 落盘 data/stats/，不存明文 IP）
├── stats-only.cjs            # 独立统计服务（端口 16723；npm run stats）
├── resolve-extensionless.mjs # Node 自定义 loader：解析无扩展名相对导入（`./countdownCore`）+ `@/` 别名 → 学生 core 测试运行必需
├── qa-student-ui.mjs         # Playwright UI QA：学生工作台 UI（npm run qa:student-ui）
├── test-countdown-core.ts    # countdownCore.ts（16 断言；npm run test:countdown）
├── test-reminder-core.ts     # reminderCore.ts（10 断言 T1-T10；npm run test:reminder）
├── test-todo-core.ts         # todoCore.ts（16 断言 T1-T16；npm run test:todo）
├── test-health-core.ts       # healthCore.ts（BMI 国标边界/达标率/睡眠时长/折线图坐标；npm run test:health）
├── test-ledger-core.ts       # ledgerCore.ts（32 断言 T1-T32；npm run test:ledger）
├── test-note-core.ts         # noteCore.ts（28 断言；npm run test:notes）
├── test-note-markdown.ts     # noteMarkdown.ts（18 断言 T1-T18；npm run test:note-markdown）
├── test-workbench-menu-core.ts # workbenchMenuCore.ts（18 断言 T1-T18；npm run test:menu）
├── test-diary-core.ts        # diaryCore.ts（15 断言/55 assertions；npm run test:diary）
├── test-panel-paging-core.ts # panelPagingCore.ts（20 断言 T1-T20；npm run test:paging）
├── test-business-core.ts     # businessCore.ts（71 断言 T1-T71；T25-T32 账本容器（T26 同年可建多本 + 编号递增，T28 seq 补发与冲突顺延）、T33-T36 删除/清空守卫、T37-T41 进货关联支出与月度统计、T42-T45 会员价/进货批次 FIFO 剩余状态/未售完批次自动均价、T46-T49 录入提效与录入校验、T50-T52 对账、T53-T54 毛利报表与会员价模拟、T55 批次库存与滞销久存预警、T56-T60 支出标题归一化与历史兼容/expenseLabel/支出行校验/同日多笔可选支出/对账 expenseLabels、T61 成本单价 costUnitPriceOf（未售完批次实际进货单价优先，回退商品维护价）、T62 毛利率=（营业收入−成本价）/营业收入 与 数量0/收入0 边界、T63 严格 FIFO 成本结转（calcFifoAllocation/calcDailyCostFifo：逐批从最旧批次消耗、各段用该批进价，超卖按维护价兜底；总统计/趋势/月度/毛利报表/商品摘要同口径）、T64 待销售估值 calcPendingSales（剩余批次进价 vs 售价）、T65 损耗出库口径（损耗不计 COGS 但消耗批次，库存与 calcInventory 一致）、T67 支出关联统计 calcExpenseLinkStats、**T68 同年多账本编号与排序（ledgerCodeOf/nextLedgerSeq/sortedLedgers/连续建 3 本编号唯一/归一化幂等）、T69 mergeBusinessStore 同年同序号合并 + 不同序号各自保留、T70 账本归属年份守卫（yearOfDate/isDateInLedgerYear/checkLedgerYearWrite：跨年拒绝、同年放行、无账本 cross-year→no-ledger）、T71 重命名账本 renameLedger（仅改 name、编号/年份不变、空名/不存在失败、不改入参）**；npm run test:business）
├── test-xlsx-export.ts       # xlsxExport.ts（8 用例 T1-T8 / 45 断言；npm run test:xlsx）：xlsxFileName 文件名形状、safeSheetName 非法字符与 31 字符截断、displayWidth 中文按 2 计、colWidths 自适应与 8~30 钳制、T6-T8 账本前缀/缺失段落省略/非法字符过滤/工作表名与文件名解耦；exportXlsx 依赖 DOM + 动态 import('xlsx') 不在此覆盖
├── test-habit-core.ts        # habitCore.ts（15 断言/73 assertions；npm run test:habits）
├── test-pomodoro-core.ts     # pomodoroCore.ts（13 断言；npm run test:pomodoro）
├── test-spotlight-core.ts    # spotlightCore.ts（21 断言；npm run test:spotlight）
├── test-snapshot-core.ts     # snapshotCore.ts（10 断言；npm run test:snapshot）
├── test-student-menu-core.ts        # studentMenuCore（npm run test:student-menu）
├── test-student-habits-core.ts      # studentHabitsCore（npm run test:student-habits）
├── test-student-homework-core.ts    # studentHomeworkCore（npm run test:student-homework）
├── test-student-reward-core.ts      # studentRewardCore（npm run test:student-reward）
├── test-student-plan-core.ts        # studentPlanCore（npm run test:student-plan）
├── test-student-reading-core.ts     # studentReadingCore（npm run test:student-reading）
├── test-student-review-core.ts      # studentReviewCore（npm run test:student-review）
├── test-student-mistakes-core.ts    # studentMistakesCore（npm run test:student-mistakes）
├── test-student-timetable-core.ts   # studentTimetableCore（npm run test:student-timetable）
├── test-student-timetable-import-core.ts # studentTimetableImportCore（14 断言 T1-T14：模板表头/mapHeaders(*) 归一化/parseWeekday/parsePeriod/normalizeWeekRange/正常导入/节次超限/文件内重复/星期写法等价/必填缺失/周次越界/覆盖计数/错误 CSV/摘要文案；npm run test:student-timetable-import）
├── test-student-exam-core.ts        # studentExamCore（npm run test:student-exam）
├── test-student-stage-core.ts       # studentStageCore（npm run test:student-stage）
├── test-student-pomodoro-core.ts    # studentPomodoroCore（npm run test:student-pomodoro）
├── test-student-achievement-core.ts # studentAchievementCore（12 断言 T1-T11 + T2b；npm run test:student-achievement）
├── test-student-parenttask-core.ts  # studentParentTaskCore（9 断言；npm run test:student-parenttask）
└── test-student-goal-core.ts        # studentGoalCore（16 断言 T1-T16；npm run test:student-goal）
```

## WHERE TO LOOK

| Task | Script | Notes |
|------|--------|-------|
| Regenerate preset icons | `generate-preset-icons.cjs` | Runs first in `npm run build`; also runnable standalone |
| Serve production build | `serve-with-rewrites.cjs` | `npm run serve`; PORT 16718 hardcoded |
| Add a game URL rewrite | `serve-with-rewrites.cjs` | if/else chain on `filePath`; redirects to trailing-slash for relative asset resolution |
| Nginx 静态托管下的云同步 | `webdav-proxy-only.cjs` | `npm run webdav-proxy`；端口 16719（可 `WEBDAV_PROXY_HOST`/`WEBDAV_PROXY_PORT` 覆盖）；Nginx 把 `/api/webdav-proxy` 反代到它，见 README「方式五」 |
| 全网访问统计（采集/聚合逻辑） | `statsService.cjs` | 纯 CJS，导出 `{ handle(req,res,pathname), flushNow, DATA_DIR, KEEP_DAYS }`；`POST /api/stats/collect` → 204、`GET /api/stats/summary?days=N` → 聚合 JSON。落盘 `data/stats/<YYYY-MM-DD>.json`（gitignore），UV = `sha256(盐+日期+IP+UA)` 前 16 位（**不存明文 IP**）。被 `serve-with-rewrites.cjs`、`stats-only.cjs`、`vite.config.js` 三处复用 |
| 全网访问统计（独立进程） | `stats-only.cjs` | `npm run stats`；端口 16723（可 `STATS_HOST`/`STATS_PORT` 覆盖）；只做 HTTP 壳 + `/healthz`，逻辑全在 `statsService.cjs`；SIGTERM 时补一次 `flushNow()` |
| 核心纯函数测试 | `test-*-core.ts` | `node --experimental-strip-types` 直跑，自研 assert 断言；被测核心禁止 import vue/pinia |
| 学生 core 纯函数测试 | `test-student-*-core.ts` + `resolve-extensionless.mjs` | 14 个 `test:student-*`，每个都带 `--experimental-loader ./scripts/resolve-extensionless.mjs`；`npm run test:student` 聚合全部 |
| 学生工作台 UI QA | `qa-student-ui.mjs` | `npm run qa:student-ui`；48 断言 / S1–S13：骨架与 16 项菜单、首页三块平铺（回归「轮播残留」）、习惯日历打卡、作业/复习/错题的状态推进、课程表周切换、阅读统计、勋章与积分、家长锁态 + PIN 弹框、16 面板逐个渲染、移动端 390px。**UI 操作驱动、pinia store 校验结果**（分页/筛选不断言 DOM 数量）。用 `findChromium()` 取本机 chromium，不做 playwright install |

## CONVENTIONS

- `.cjs` = CommonJS — required because `package.json` has `"type": "module"`
- `serve-with-rewrites.cjs` / `webdav-proxy-only.cjs` / `statsService.cjs` / `stats-only.cjs` 只用 Node stdlib — zero dependencies
- PORT 16718（页面）+ 16719（WebDAV 代理）+ 16720（fetch-meta）+ 16721（wechat）+ 16723（stats）hardcoded — keep in sync with vite.config.js, Dockerfile, start-server.bat, pm2.config.cjs, nginx.conf
- **statsService 的盐与数据目录都不入库**：`data/stats/` 已 gitignore；`.salt` 泄露等于让别人能反查访客哈希，任何情况下都不要提交、不要打进备份包
- **statsService 改动后要重启两处**：`npm run serve`（16718 内置）与 `easy-web-stats`（16723 独立进程，`pm2 restart easy-web-stats`）。只重启 pm2 里的 nginx 或静态发布都不生效
- **学生 core 测试 loader**: 全部 `test:student-*` 必须带 `--experimental-loader ./scripts/resolve-extensionless.mjs`（学生 cores 用无扩展名相对导入 `./countdownCore`/`./diaryCore`/`./habitCore`/`./studentMenuCore` + `@/` 别名；纯 `node --experimental-strip-types` 报 `ERR_MODULE_NOT_FOUND`/`ERR_UNSUPPORTED_DIR_IMPORT`）— `resolve-extensionless.mjs` 自解析 `.ts`/`/index.ts` + `@/` → `src/` 映射；勿改成带扩展名导入（那会被 Vite/真实运行时拒绝）

## ANTI-PATTERNS

- **NEVER edit `src/composables/presetIcons.ts` directly** — regenerate via `generate-preset-icons.cjs`
- **NEVER append `.html`** to game paths — rewrites map extensionless URLs to `/{game}/index.html`
- **gushi has no rewrite** — manifest.json registers it, but `serve-with-rewrites.cjs` lacks a `/games/gushi` entry (relative assets may break)
- **不要在 scripts/ 里加一次性 Playwright 脚本** — 历史上有 36 个 `qa-*.mjs`（约 577 KB），全部依赖 16718 dev server 且证据写进已删除的 `.omo/evidence/`，维护成本远大于收益，已整体移除。要做 UI 回归请写进 `tests/` 并接真正的 test runner
- **NEVER hardcode credentials in scripts** — Gitee 仓库是**公开**的，写死等于把口令挂到公网（事故：`import-today-to-blog.mjs` / `resume-publish.mjs` 曾写死 `DAV_PASS`）。WebDAV 一律经 `scripts/dav-creds.mjs` 读取：`EWT_DAV_URL` / `EWT_DAV_USER` / `EWT_DAV_PASS` 环境变量，或 gitignored 的 `config/webdav.env`（模板 `config/webdav.env.example` 入库）。其它后端凭证照 `config/blog-share.env` 的同款范式办，口令缺失时就报错退出，**不要**设内置默认值

## KEY GOTCHAS

- `npm run serve` → custom server WITH game rewrites; `pm2 start` → `server.cjs` → `npx serve -s` (NO game rewrites) — divergent serving
- SPA fallback: unknown paths serve `dist/index.html` (single-page routing for /display etc.)
- Build pipeline: `node scripts/generate-preset-icons.cjs && vue-tsc -b && vite build` — icons must regenerate BEFORE type-check
- 本机内存紧张时构建需 `NODE_OPTIONS=--max-old-space-size=3072 npm run build`（默认会 OOM）
- `test-student-achievement-core.ts` 曾因内置勋章从 10 个扩到 26 个而失效（学生番茄钟下线后又减到 22 个）——
  改 `studentAchievementCore.ts` 的 `BUILTIN_ACHIEVEMENT_IDS` 后**必须同步更新该测试的期望值**
  （T1 长度 / T2 首条 name / T2b 分类分布 / T11 统计口径）。T2b 末尾有「ids 与 defs 一一对应」的守卫断言：
  若只改 ids 不删对应定义（或反之），该断言会失败——因为孤儿 id 会让 `calcAllBuiltUnlocked`（全能学霸）永远返回 0
- `store/workbenchBusiness.saveBusiness()` 对商品/支出两个分类数组做 `toRaw().map(c => ({...toRaw(c)}))` 元素级深拷贝：
  `businessCore` 分类 CRUD 把 reactive 数组传入后经 `[...list, next]` / `list.map(...)` 返回新数组，元素仍是 Proxy——整体
  `toRaw` 只解外层、IDB structured clone 抛 `DataCloneError`；勿改回仅整体 `toRaw`
