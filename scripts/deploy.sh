#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/apps/work-summary}"
SERVICE="${SERVICE:-work-summary}"

cd "$APP_DIR"

# 防止服务器上有人手改代码后被自动部署覆盖
if [ -n "$(git status --porcelain)" ]; then
  echo "[deploy] 工作区有未提交改动，停止部署：" >&2
  git status --short >&2
  exit 1
fi

echo "[deploy] 更新代码"
git pull --ff-only origin main

echo "[deploy] 安装依赖"
npm ci

# 迁移是幂等的，已执行过的迁移会自动跳过
echo "[deploy] 执行数据库迁移"
npm run db:migrate

echo "[deploy] 构建生产版本"
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" npm run build

echo "[deploy] 重启应用"
sudo -n systemctl restart "$SERVICE"
systemctl --no-pager --full status "$SERVICE" | sed -n '1,12p' || true

echo "[deploy] 检查登录页"
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS \
  http://127.0.0.1:3000/login > /dev/null

echo "[deploy] 完成：$(git rev-parse --short HEAD)"
