#!/usr/bin/env bash
# ============================================================================
# easy-web-tab 一键部署脚本（Linux / nginx）
#
# 用途：拉取仓库最新代码 → 判断是否有更新 → 有更新才编译 → 仅编译成功后发布到 nginx。
#       可配合 crontab 每 2 小时自动执行一次（无更新时秒级返回，不做无谓构建）。
#
# 典型用法（手动执行）：
#       chmod +x webTab.sh && ./webTab.sh
#
# 定时执行示例（每 2 小时一次，推荐）：
#       crontab -e
#       # ── 每 2 小时的第 0 分钟执行（0,2,4,6,...,22 点整）──
#       0 */2 * * * /root/workspace/easy-web-tab/webTab.sh >> /var/log/easy-web-tab-deploy.log 2>&1
#       # 或指定时刻错开整点（如 1:17、3:17、5:17…，避开整点高峰）：
#       17 */2 * * * /root/workspace/easy-web-tab/webTab.sh >> /var/log/easy-web-tab-deploy.log 2>&1
#
#       说明：
#       - 脚本自身幂等：无更新时直接 exit 0，无需担心重复发布。
#       - 用绝对路径（cron 的 PATH 很短，不能用相对路径或依赖 ~/.bashrc 里的别名）。
#       - 建议加 flock 防止任务重叠（见文末「并发防护」一节）。
#
# 部署流程总览：
#   1) 准备代码   —— 首次 git clone；之后 git fetch + merge --ff-only（**不删除工作目录**）
#   2) 更新判定   —— 比对本地 HEAD 与 origin/master：无更新且已有产物则直接退出（不编译不发布）
#   3) 准备依赖   —— node_modules 已存在则跳过拷贝；否则从共享目录拷或 npm install
#   4) 编译       —— npm run build，产物为空即判定异常并中止（线上版本不受影响）
#   5) 备份       —— 发布前把当前线上版本打包进备份目录，保留最近 KEEP_BACKUPS 份
#   6) 发布       —— 清空 nginx 目录后拷入新产物，并校验结果非空
#
# 关键约束：
#   - set -euo pipefail：任意一步失败立即退出，不会带着失败/旧产物继续部署。
#   - 任何失败路径都会明确输出「线上版本未改动」，便于判断是否需要人工介入。
#   - pull 前检测未提交改动：脏工作区会让 --ff-only 失败并表现为莫名的编译错误。
# ============================================================================

set -euo pipefail

WORK_DIR=/root/workspace/easy-web-tab
NGINX_HTML=/usr/share/nginx/html
# 本机共享的依赖目录：首次部署时从它拷进工作目录，之后就不再重复拷贝
SHARED_NODE_MODULES=/root/workspace/node_modules
# 部署分支（master）
BRANCH=master
# 备份目录：每次发布前把当前线上版本打成 tar.gz 存这里，便于回滚
BACKUP_DIR=/root/workspace/easy-web-tab-backups
# 备份保留份数（超出后自动删除最旧的）
KEEP_BACKUPS=10

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*"; }
fail() { log "失败：$*"; exit 1; }

# 目录非空判定（避免 `ls` 的坑）
#   ⚠️ 千万不要写 `[ -n "$(ls -A "$dir" 2>/dev/null)" ]`：目录不存在时 ls 返回退出码 2，
#      而**命令替换会把该退出码传播给 set -e**，导致脚本在此处直接中断（表现为"部署莫名失败"）。
#      这里改用 shell 内建的 glob 展开做判断：目录不存在直接返回 1，空目录返回 1，非空返回 0。
is_dir_nonempty() {
  local d="$1" f
  [ -d "$d" ] || return 1
  for f in "$d"/* "$d"/.[!.]*; do
    if [ -e "$f" ]; then return 0; fi
  done
  return 1
}

# ============================================================
# 1) 准备代码：首次 clone，之后增量 pull
# ============================================================
if [ -d "$WORK_DIR/.git" ]; then
  log "工作目录已存在，增量拉取（不删除）: $WORK_DIR"
  cd "$WORK_DIR"

  # 构建会自动改写生成文件（src/composables/presetIcons.ts 由 scripts/generate-preset-icons.cjs 产出），
  # 上次编译后它必然是「已修改」状态。这不是人的改动，不该阻塞部署 —— 先无条件还原。
  # 代价仅为重新生成（秒级），换来脚本可重复执行而不受历史产物污染。
  if ! git diff --quiet -- src/composables/presetIcons.ts 2>/dev/null; then
    git checkout -- src/composables/presetIcons.ts 2>/dev/null || true
    log "已还原构建自动生成文件: src/composables/presetIcons.ts"
  fi

  # 剩余的未提交改动视为「真实改动」（有人在服务器上改了代码），会让 --ff-only 失败，
  # 故明确报出（最多列 5 条），避免表现为莫名的合并/构建错误。
  dirty=$(git status --porcelain)
  if [ -n "$dirty" ]; then
    fail "工作目录存在未提交改动，请先处理后重试：$(printf '%s' "$dirty" | head -n 5)"
  fi
  # 拉取远端最新（不 merge 到工作区外的分支，只更新 origin/ 引用）
  if ! git fetch origin "$BRANCH"; then
    fail "git fetch 失败（网络异常或凭据问题）。线上版本未改动，可稍后重试。"
  fi
else
  log "首次部署，克隆仓库: $WORK_DIR"
  # 仅在确认不是 git 仓库时才清空（首次部署残留目录），正常情况下不会走到这
  rm -rf "$WORK_DIR"
  git clone --branch "$BRANCH" https://gitee.com/sifujiang/easy-web-tab.git "$WORK_DIR" \
    || fail "git clone 失败。线上版本未改动。"
  cd "$WORK_DIR"
fi

# 记录本地/远端提交号，供下一步比较。REMOTE_SHA 取不到时留空（不误判为"无更新"）
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")
LOG_SINCE=$(git log -1 --format='%h %ad %s' --date=format:'%Y-%m-%d %H:%M' 2>/dev/null || echo "（无提交记录）")

# ============================================================
# 2) 判断是否有更新：无更新则直接退出，不编译不发布
# ============================================================
# 产物是否已存在（存在才允许"无更新直接跳过"，否则首次/被清时仍需编译一次）
DIST_EXISTS=0
is_dir_nonempty "$WORK_DIR/dist" && DIST_EXISTS=1

if [ -n "$REMOTE_SHA" ] && [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  if [ "$DIST_EXISTS" -eq 1 ]; then
    log "无更新（本地 = 远端 $LOCAL_SHA），且本地已有 dist，跳过编译与发布。"
    log "当前版本: $LOG_SINCE"
    exit 0
  fi
  log "无更新，但本地缺少 dist（首次或产物被清），仅编译发布一次以生成产物。"
else
  log "检测到更新：$LOCAL_SHA -> $REMOTE_SHA"
  # 有更新时快进到远端；本地无改动故可安全 --ff-only
  git merge --ff-only "origin/$BRANCH" >/dev/null \
    || fail "无法快进到 origin/$BRANCH（可能有分叉），已中止。线上版本未改动。"
  NEW_SHA=$(git rev-parse HEAD)
  log "更新日志（自上一版本起）："
  git log --oneline --no-decorate "$LOCAL_SHA".."$NEW_SHA" | sed 's/^/    /'
fi

# ============================================================
# 3) 依赖：目标目录已有 node_modules 则跳过拷贝
# ============================================================
if is_dir_nonempty "$WORK_DIR/node_modules"; then
  log "node_modules 已存在，跳过依赖拷贝。"
else
  if [ -d "$SHARED_NODE_MODULES" ]; then
    log "复用本机依赖：$SHARED_NODE_MODULES -> $WORK_DIR/node_modules"
    cp -rf "$SHARED_NODE_MODULES" "$WORK_DIR"
  else
    log "未找到本机依赖目录，执行 npm install（较慢）..."
    npm install --no-audit --no-fund
  fi
  log "依赖就绪。"
fi

# ============================================================
# 4) 编译（set -e：编译报错立即退出，不会执行后面的部署）
# ============================================================
# 低内存服务器上 `vite build` 会被系统 OOM killer 杀掉（日志表现为 `Killed`，退出码 137）。
#
# 实测案例（2GB 内存 / 无 swap 的云服务器）：
#   node 被杀时 anon-rss 1353MB + file-rss 67MB ≈ 1420MB，而 MemAvailable 只有 1419MB —— 正好差 1MB。
#   根因：--max-old-space-size 若大于 MemAvailable，V8 会以为"还有 2GB 可用"，
#   于是放心把堆涨到物理上限（1.35GB+），必然触发 OOM killer。
#
# 对策：
#   - RAYON_NUM_THREADS=1  → rolldown 串行渲染，峰值内存显著下降（代价：慢几十秒）
#   - 堆上限按**实测 MemAvailable 自动测算**（而非固定 2048），并留出安全余量。
#     关键：固定大值在低配机上是有害的，必须按实际可用内存缩放。
# 可用 BUILD_LOWMEM=0 / BUILD_HEAP_MB=<MB> 覆盖自动测算。
if [ "${BUILD_LOWMEM:-1}" = "1" ]; then
  export RAYON_NUM_THREADS=1

  # 取当前可用内存（KB）。取不到时按 2048MB 保守处理。
  # 注意：free 的 available 列已是"不牺牲 buff/cache 前提下还能拿到多少"，正是我们要的。
  AVAIL_KB=$(awk '/^MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null || echo "")
  if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -gt 0 ] 2>/dev/null; then
    AVAIL_MB=$((AVAIL_KB / 1024))
  else
    AVAIL_MB=2048
    log "无法读取 /proc/meminfo 的 MemAvailable，按${AVAIL_MB}MB 估算"
  fi

  # 安全余量：给 nginx / sshd / 本脚本自身留 400MB。低于 512MB 视为过小，直接按 512 处理。
  #实测：可用 1419MB - 400 余量 = 1019MB 堆上限，V8 会在 1GB 附近就触发 GC，不会涨到 1.35GB。
  SAFE_MB=400
  HEAP_MB=$((AVAIL_MB - SAFE_MB))
  [ "$HEAP_MB" -lt 512 ] && HEAP_MB=512
  # 用户显式指定则优先
  [ -n "${BUILD_HEAP_MB:-}" ] && HEAP_MB="$BUILD_HEAP_MB"

  export NODE_OPTIONS="--max-old-space-size=${HEAP_MB}"
  log "低内存模式：可用内存 ${AVAIL_MB}MB，堆上限设为 ${HEAP_MB}MB（余量 ${SAFE_MB}MB），RAYON_NUM_THREADS=1"
  if [ "$AVAIL_MB" -lt 1200 ]; then
    log "提示：可用内存不足 1.2GB，构建可能仍吃紧。建议开swap："
    log "      dd if=/dev/zero of=/swapfile bs=1M count=2048 && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
    log "      （并把 '/swapfile swap defaults 0 0' 追加到 /etc/fstab 以便重启后自动挂载）"
  fi
else
  log "低内存模式已关闭（BUILD_LOWMEM=0）"
fi

log "开始编译..."
npm run build || fail "编译失败。线上版本保持为上一版本，未被覆盖。若日志显示 'Killed'，说明内存不足被系统 OOM 杀掉，可下调 BUILD_HEAP_MB 或关闭构建并发后重试。"
log "编译成功!"

# 产物校验：dist 必须存在且非空，否则视为构建异常
is_dir_nonempty "$WORK_DIR/dist" \
  || fail "dist 为空或不存在，判定构建异常。线上版本未改动。"

# ============================================================
# 5) 发布前备份当前线上版本（仅当线上有内容时才备份）
# ============================================================
log "备份当前线上版本..."
mkdir -p "$BACKUP_DIR"
if is_dir_nonempty "$NGINX_HTML"; then
  BACKUP_FILE="$BACKUP_DIR/easy-web-tab-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$BACKUP_FILE" -C "$NGINX_HTML" .
  log "已备份: $BACKUP_FILE"

  # 备份轮转：仅保留最近 KEEP_BACKUPS 份，超出的最旧备份删除。
  # 不用 `ls | head -n -N`（ls 找不到匹配文件时返回非 0，会在 set -e / pipefail 下中断脚本），
  # 改用 glob + 数组排序后按计数丢弃。
  backups=("$BACKUP_DIR"/easy-web-tab-*.tar.gz)
  if [ "${#backups[@]}" -gt "$KEEP_BACKUPS" ]; then
    # 文件名内嵌时间戳，字典序 == 时间序，无需 date 解析
    while IFS= read -r old; do
      [ -n "$old" ] && rm -f "$old" && log "已清理旧备份: $(basename "$old")"
    done < <(printf '%s\n' "${backups[@]}" | sort | head -n "$(( ${#backups[@]} - KEEP_BACKUPS ))")
  fi
  log "备份保留最近 $KEEP_BACKUPS 份。"
else
  log "线上目录为空或不存在，跳过备份。"
fi

# ============================================================
# 6) 发布（仅在编译成功后才会执行到这里）
#    先清空再拷贝：nginx 目录里可能残留旧版本的 chunk，残留会导致旧文件被继续引用
# ============================================================
log "发布到 $NGINX_HTML ..."
rm -rf "${NGINX_HTML:?}"/* "${NGINX_HTML:?}"/.[!.]* 2>/dev/null || true
cp -rf "$WORK_DIR/dist/." "$NGINX_HTML/"
cd $WORK_DIR
cp -rf ./dist "$NGINX_HTML/"
is_dir_nonempty "$NGINX_HTML" || fail "发布后目录为空，判定拷贝异常。"

log "部署完成: $(git rev-parse --short HEAD) $LOG_SINCE"

# ============================================================================
# 附：并发防护（可选但建议）
#
# 编译耗时可能超过 2 小时（极端情况），此时下一轮定时任务会与本轮重叠，
# 造成两个进程同时写 dist / nginx 目录。两种防护方案，任选其一：
#
# 方案 A —— crontab 层加锁（最简单，推荐）：
#         0 */2 * * * flock -n /var/lock/easy-web-tab-deploy.lock /root/workspace/easy-web-tab/webTab.sh >> /var/log/easy-web-tab-deploy.log 2>&1
#         含义：-n = 非阻塞抢锁，抢不到就直接放弃本轮（flock 返回 1，不会产生任何副作用）。
#
# 方案 B —— 脚本内自锁（在本文件顶部 set -euo pipefail 之后加两行）：
#         exec 9>/var/lock/easy-web-tab-deploy.lock
#         flock -n 9 || { echo "[$(ts)] 已有部署任务在运行，本轮跳过"; exit 0; }
#
# 附：排错速查
#   - 日志里出现「无更新」：正常，说明远端没变化，线上仍是上一版本。
#   - 日志里出现「工作目录存在未提交改动」：服务器上有人改过文件或构建残留，
#     确认无用后可 `cd /root/workspace/easy-web-tab && git checkout -- . && git clean -fd` 再重试。
#   - 日志里出现「编译失败」：线上仍为上一版本，可查看构建输出定位问题。
#   - 想看历史发布记录：`ls -lt /root/workspace/easy-web-tab-backups/`
# ============================================================================
