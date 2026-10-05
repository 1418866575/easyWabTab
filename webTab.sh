#!/usr/bin/env bash
# 部署脚本：拉取最新代码 -> 判断是否有更新 -> 有更新才编译 -> 仅编译成功后部署到 nginx
#
# 设计要点：
#   1. 不再 rm -rf 工作目录：改为 git clone（首次）/ git pull（增量）。
#      这样拉取失败时旧代码与旧站点都还在，不会把工作目录搞没。
#   2. 拉取后比对本地 HEAD 与远端分支：**无更新则直接退出，不编译不发布**，
#      避免每次执行都白跑一遍构建、也避免无谓地覆盖线上（线上此刻仍是旧版本，完好）。
#   3. node_modules 复用：目标目录已存在依赖时不再拷贝（省一次 GB 级复制）。
#   4. 备份轮转用「时间戳排序 + 计数」，避免 ls 解析与 head 负数在部分环境的差异。
# 任意一步失败立即退出（set -e），不会带着失败产物继续部署。
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

# ============================================================
# 1) 准备代码：首次 clone，之后增量 pull
# ============================================================
if [ -d "$WORK_DIR/.git" ]; then
  log "工作目录已存在，增量拉取（不删除）: $WORK_DIR"
  cd "$WORK_DIR"
  # 有本地改动会让 pull 失败；先明确报出来，避免后面出现莫名的构建错误
  if [ -n "$(git status --porcelain)" ]; then
    fail "工作目录存在未提交改动，请先处理后重试：$(git status --porcelain | head -n 5)"
  fi
  # 拉取远端最新（不 merge 到工作区外的分支，只更新 origin/ 引用）
  if ! git fetch origin "$BRANCH"; then
    fail "git fetch 失败（网络异常或凭据问题）。线上版本未改动，可稍后重试。"
  fi
else
  log "首次部署，克隆仓库: $WORK_DIR"
  rm -rf "$WORK_DIR"
  git clone --branch "$BRANCH" https://gitee.com/sifujiang/easy-web-tab.git "$WORK_DIR" \
    || fail "git clone 失败。线上版本未改动。"
  cd "$WORK_DIR"
fi

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")
LOG_SINCE=$(git log -1 --format='%h %ad %s' --date=format:'%Y-%m-%d %H:%M' 2>/dev/null || echo "（无提交记录）")

# ============================================================
# 2) 判断是否有更新：无更新则直接退出，不编译不发布
# ============================================================
DIST_EXISTS=0
[ -d "$WORK_DIR/dist" ] && [ -n "$(ls -A "$WORK_DIR/dist" 2>/dev/null)" ] && DIST_EXISTS=1

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
if [ -d "$WORK_DIR/node_modules" ] && [ -n "$(ls -A "$WORK_DIR/node_modules" 2>/dev/null)" ]; then
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
log "开始编译..."
npm run build || fail "编译失败。线上版本保持为上一版本，未被覆盖。"
log "编译成功!"

# 产物校验：dist 必须存在且非空，否则视为构建异常
[ -d "$WORK_DIR/dist" ] && [ -n "$(ls -A "$WORK_DIR/dist" 2>/dev/null)" ] \
  || fail "dist 为空或不存在，判定构建异常。线上版本未改动。"

# ============================================================
# 5) 发布前备份当前线上版本（仅当线上有内容时才备份）
# ============================================================
log "备份当前线上版本..."
mkdir -p "$BACKUP_DIR"
if [ -d "$NGINX_HTML" ] && [ -n "$(ls -A "$NGINX_HTML" 2>/dev/null)" ]; then
  BACKUP_FILE="$BACKUP_DIR/easy-web-tab-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$BACKUP_FILE" -C "$NGINX_HTML" .
  log "已备份: $BACKUP_FILE"
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
[ -n "$(ls -A "$NGINX_HTML" 2>/dev/null)" ] || fail "发布后目录为空，判定拷贝异常。"

log "部署完成: $(git rev-parse --short HEAD) $LOG_SINCE"
