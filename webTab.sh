#!/usr/bin/env bash
# 部署脚本：拉取最新代码 -> 编译 -> 仅编译成功后部署到 nginx
# 任意一步失败立即退出，不会带着失败产物或旧产物继续部署。
set -euo pipefail

WORK_DIR=/root/workspace/easy-web-tab
NGINX_HTML=/usr/share/nginx/html
# 备份目录：每次部署前把当前线上版本打成 tar.gz 存这里，便于回滚
BACKUP_DIR=/root/workspace/easy-web-tab-backups
# 备份保留份数（超出后自动删除最旧的）
KEEP_BACKUPS=10

# 1) 拉取最新代码
rm -rf "$WORK_DIR"
git clone https://gitee.com/sifujiang/easy-web-tab.git "$WORK_DIR"

# 2) 复用本地已安装依赖，避免重新 npm install
#    注意：若 package.json 新增了依赖（如本次新增的 unplugin-auto-import /
#    unplugin-vue-components），需先把这些包装进 /root/workspace/node_modules，
#    否则后续编译会因找不到模块而失败并立即中止（符合「报错即停止」预期）。
cp -rf /root/workspace/node_modules "$WORK_DIR"

cd "$WORK_DIR"

# 3) 编译（set -e：编译报错会立即退出，不会执行后面的部署）
echo "开始编译..."
npm run build
echo "编译成功!"

# 4) 部署前备份当前线上版本（仅当线上有内容时才备份）
echo "部署前备份当前线上版本..."
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
if [ -d "$NGINX_HTML" ] && [ -n "$(ls -A "$NGINX_HTML" 2>/dev/null)" ]; then
  BACKUP_FILE="$BACKUP_DIR/easy-web-tab-$TIMESTAMP.tar.gz"
  tar -czf "$BACKUP_FILE" -C "$NGINX_HTML" .
  echo "已备份当前版本: $BACKUP_FILE"
  # 仅保留最近 KEEP_BACKUPS 份，删除更旧的（按文件名时间戳排序，最旧在前）
  if [ -n "$(ls -1 "$BACKUP_DIR"/easy-web-tab-*.tar.gz 2>/dev/null)" ]; then
    ls -1 "$BACKUP_DIR"/easy-web-tab-*.tar.gz | head -n -"$KEEP_BACKUPS" | while read -r f; do rm -f "$f"; done
  fi
  echo "备份保留最近 $KEEP_BACKUPS 份。"
else
  echo "线上目录为空或不存在，跳过备份。"
fi

# 5) 部署（仅在编译成功后才会执行到这里）
echo "开始部署到 $NGINX_HTML ..."
rm -rf "$NGINX_HTML"
mkdir -p "$NGINX_HTML"
cp -rf "$WORK_DIR/dist/." "$NGINX_HTML/"

echo "部署完成!"
