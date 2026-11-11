#!/usr/bin/env bash
# ============================================================================
# autoSynData.sh — 数据自动同步（定时任务每 2 小时执行一次）
#
# 流程：定位仓库 → 与远端同步（pull --rebase --autostash）→ 检查改动
#       → 有改动则提交「<时间> 推送数据」→ 推送到上游分支
#
# 手动执行： chmod +x autoSynData.sh && ./autoSynData.sh
# 定时执行： crontab -e
#   0 */2 * * * /bin/bash /绝对路径/autoSynData.sh >> /var/log/autoSynData.log 2>&1
#   # 防重入：0 */2 * * * flock -n /tmp/autoSynData.lock /bin/bash /绝对路径/autoSynData.sh >> /var/log/autoSynData.log 2>&1
#
# 前提：
#   - 仓库已配置 user.name / user.email，且能免密推送（SSH key 或凭据助手）。
#   - 脚本放在哪个 git 仓库目录，就同步哪个仓库；可随意移动。
#   - 不想被提交的文件写进 .gitignore 或 .git/info/exclude，git add -A 会遵守。
#   - cron 的 PATH 很短，脚本用绝对路径调用；git 需在 /usr/bin 等默认路径下。
# ============================================================================

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

command -v git >/dev/null 2>&1 || { log "git 不可用，退出"; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { log "当前目录不是 git 仓库，退出"; exit 1; }

# 防重入：锁文件放 .git 目录，不会被 git 跟踪
if command -v flock >/dev/null 2>&1; then
  exec 9>"$(git rev-parse --git-dir)/autoSynData.lock"
  flock -n 9 || { log "已有实例在运行，本轮跳过"; exit 0; }
fi

BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null)" || { log "处于 detached HEAD，跳过"; exit 0; }
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)" || {
  log "分支 $BRANCH 未设置上游，跳过（先执行 git push -u origin $BRANCH）"; exit 0; }
REMOTE="${UPSTREAM%%/*}"

# 1) 先与远端同步。--autostash 自动暂存本地未提交改动、拉取后恢复，避免脏工作区卡住 pull
if ! git pull --rebase --autostash --quiet "$REMOTE" "$BRANCH"; then
  log "拉取失败或存在冲突，本轮停止（未推送，请人工处理后重试）"
  exit 1
fi
if [ -n "$(git ls-files -u)" ]; then
  log "存在未解决的冲突，本轮停止（未推送）"
  exit 1
fi

# 2) 判断是否需要动作；AHEAD 兼顾「上次提交成功但推送失败」的遗留提交
DIRTY="$(git status --porcelain)"
AHEAD="$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
if [ -z "$DIRTY" ] && [ "$AHEAD" -eq 0 ]; then
  log "无改动，跳过"
  exit 0
fi

# 3) 提交 + 推送
if [ -n "$DIRTY" ]; then
  STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
  git add -A
  git commit -m "$STAMP 推送数据"
  log "已提交：$STAMP 推送数据"
fi
git push "$REMOTE" "$BRANCH"
log "推送完成 -> $UPSTREAM"
