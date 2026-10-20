// 跨平台、低内存安全的构建包装器（CommonJS）。
//
// 问题：`vite build` 走 Rolldown（Rust），其原生分配器与 V8 竞争同一份物理内存。
// 在「空闲内存偏紧」的机器上（8GB 开发机同时开浏览器 + IDE 很常见），默认多线程的
// Rolldown + 偏大的 V8 堆会把系统内存吃满，构建以
//   "memory allocation ... bytes failed"（原生 OOM，非 V8 溢出）
// 非正常退出。本项目部署在低内存云服务器上也曾复现。
//
// 修复：默认让 Rolldown 单线程、并给 V8 堆设上限；但仅在调用方未显式设置时才生效，
// 这样服务器侧的 webTab.sh 低内存守卫（会按 MemAvailable 动态设定 RAYON_NUM_THREADS
// 与 NODE_OPTIONS）仍可覆盖本默认值。
//
// 用法：package.json 的 build 已改为 `node scripts/build-safe.cjs`。

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const env = { ...process.env };

// 1) Rolldown 并行度：默认单线程（低内存下稳定通过）。
env.RAYON_NUM_THREADS = env.RAYON_NUM_THREADS || '1';

// 2) V8 堆上限：除非已显式带 --max-old-space-size，否则保守设为 1536MB，
//    给原生 rolldown 留出内存余量（实测 4096MB 会挤爆原生分配器）。
if (!env.NODE_OPTIONS || !/max-old-space-size/.test(env.NODE_OPTIONS)) {
  const extra = '--max-old-space-size=1536';
  env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${extra}` : extra;
}

function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (r.error) {
    console.error('[build-safe] 启动子进程失败:', r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.info(
  `[build-safe] RAYON_NUM_THREADS=${env.RAYON_NUM_THREADS} NODE_OPTIONS=${env.NODE_OPTIONS}`
);

run(['scripts/gen-books-manifest.cjs']);
run(['scripts/generate-preset-icons.cjs']);
run(['node_modules/vite/bin/vite.js', 'build']);
