#!/usr/bin/env bash
# 回滚脚本：将 nginx 线上版本恢复到【上一个版本】（最近一次部署前自动备份的版本）。
#
# 部署脚本 webTab.sh 在每次部署前都会把当时线上内容备份到
# $BACKUP_DIR/easy-web-tab-<时间戳>.tar.gz。
# 本脚本默认恢复其中【最新的一份】——即当前线上版本的前一版（上一个版本）。
#
# 用法：
#   ./webTab-restore.sh            # 恢复上一个版本（最新备份），需交互确认
#   ./webTab-restore.sh -y         # 同上，跳过确认（适合自动化 / CI）
#   ./webTab-restore.sh --list     # 列出所有可用备份
#   ./webTab-restore.sh <file>     # 恢复指定备份（传文件名或完整路径）
#
# 注意：恢复前会先把当前线上版本备份到 $BACKUP_DIR/prerestore/，
#       以便误操作时仍可手动找回被替换的版本。
set -euo pipefail

NGINX_HTML=/usr/share/nginx/html
BACKUP_DIR=/root/workspace/easy-web-tab-backups
PRERESTORE_DIR="$BACKUP_DIR/prerestore"

# ---- 参数解析 ----
ARG="${1:-}"

# 列出模式
if [ "$ARG" = "--list" ] || [ "$ARG" = "-l" ]; then
  echo "可用备份（新 -> 旧）："
  if [ -d "$BACKUP_DIR" ] && ls -1t "$BACKUP_DIR"/easy-web-tab-*.tar.gz >/dev/null 2>&1; then
    ls -1t "$BACKUP_DIR"/easy-web-tab-*.tar.gz | nl
    echo ""
    echo "（prerestore/ 下为每次恢复前自动保留的被替换版本，需手动指定路径恢复）"
    if [ -d "$PRERESTORE_DIR" ] && ls -1t "$PRERESTORE_DIR"/easy-web-tab-*.tar.gz >/dev/null 2>&1; then
      ls -1t "$PRERESTORE_DIR"/easy-web-tab-*.tar.gz | sed 's/^/  [prerestore] /'
    fi
  else
    echo "（暂无备份）"
  fi
  exit 0
fi

# ---- 选定要恢复的备份 ----
if [ -n "$ARG" ] && [ "$ARG" != "-y" ] && [ "$ARG" != "--yes" ]; then
  # 显式指定文件：支持完整路径 / 备份目录下的文件名 / prerestore 下的文件名
  if [ -f "$ARG" ]; then
    BACKUP_FILE="$ARG"
  elif [ -f "$BACKUP_DIR/$ARG" ]; then
    BACKUP_FILE="$BACKUP_DIR/$ARG"
  elif [ -f "$PRERESTORE_DIR/$ARG" ]; then
    BACKUP_FILE="$PRERESTORE_DIR/$ARG"
  else
    echo "错误：找不到备份文件: $ARG" >&2
    exit 1
  fi
  AUTO_YES=0
else
  # 默认：上一个版本 = 最新的一份部署前备份
  BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/easy-web-tab-*.tar.gz 2>/dev/null | head -n 1 || true)
  if [ -z "$BACKUP_FILE" ]; then
    echo "错误：没有可用备份，无法回滚。请先通过 webTab.sh 部署以生成备份。" >&2
    exit 1
  fi
  if [ "$ARG" = "-y" ] || [ "$ARG" = "--yes" ]; then
    AUTO_YES=1
  else
    AUTO_YES=0
  fi
fi

echo "即将恢复备份: $BACKUP_FILE"
echo "目标目录: $NGINX_HTML"

# 交互确认（非 -y 模式；非交互环境读不到输入则视为取消）
if [ "$AUTO_YES" -ne 1 ]; then
  if ! read -r -p "确认恢复到该版本? (y/N): " ANS; then ANS=""; fi
  case "$ANS" in
    y|Y) ;;
    *) echo "已取消。"; exit 0 ;;
  esac
fi

# 恢复前先备份当前线上版本（被替换的版本），便于二次回滚
mkdir -p "$PRERESTORE_DIR"
CURRENT_TS=$(date +%Y%m%d-%H%M%S)
if [ -d "$NGINX_HTML" ] && [ -n "$(ls -A "$NGINX_HTML" 2>/dev/null)" ]; then
  tar -czf "$PRERESTORE_DIR/easy-web-tab-$CURRENT_TS.tar.gz" -C "$NGINX_HTML" .
  echo "已备份当前线上版本(便于回滚本次恢复): $PRERESTORE_DIR/easy-web-tab-$CURRENT_TS.tar.gz"
fi

# 覆盖部署
echo "恢复中..."
rm -rf "$NGINX_HTML"
mkdir -p "$NGINX_HTML"
tar -xzf "$BACKUP_FILE" -C "$NGINX_HTML"

echo "恢复完成! 当前线上版本来自: $BACKUP_FILE"
