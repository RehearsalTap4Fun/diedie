#!/usr/bin/env bash
# 部署 web(PWA) 版到自己的服务器：rsync dist-web/ → 远端目录（npm run deploy 会先构建）
# 用法：
#   DIEDIE_SSH=root@1.2.3.4 DIEDIE_PATH=/var/www/diedie tools/deploy.sh
# 变量可写进项目根目录的 .deploy.env（已 gitignore）。
# 与饮食日记同机部署时，DIEDIE_SSH 填 nutri/.deploy.env 里同一个 NUTRI_SSH 即可；
# nginx 的 /diedie/ 缓存规则见 tools/nginx-diedie.inc（一次性配置）。
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .deploy.env ] && set -a && . ./.deploy.env && set +a
: "${DIEDIE_SSH:?需要 DIEDIE_SSH，例如 root@1.2.3.4 或 ssh config 里的 Host 名}"
: "${DIEDIE_PATH:=/var/www/diedie}"
[ -f dist-web/sw.js ] || { echo "dist-web/ 不存在，先 npm run build:web"; exit 1; }

echo "▶ 同步到 $DIEDIE_SSH:$DIEDIE_PATH"
ssh "$DIEDIE_SSH" "mkdir -p '$DIEDIE_PATH'"
# 先传带哈希的资源，最后传 index.html / sw.js，避免新页面先到、资源还没到
# assets/ 用 P 过滤保护不删：发版瞬间仍开着的旧页面还能从网络取到旧哈希语音
rsync -az dist-web/assets/ "$DIEDIE_SSH:$DIEDIE_PATH/assets/"
rsync -az --delete --filter='P assets/' dist-web/ "$DIEDIE_SSH:$DIEDIE_PATH/"
if [ "${DIEDIE_RELOAD:-0}" = "1" ]; then
  echo "▶ reload nginx"
  ssh "$DIEDIE_SSH" "sudo -n nginx -t && sudo -n systemctl reload nginx"
fi
echo "✓ 已同步。本地版本：$(cat dist-web/version.json)"
if [ -n "${DIEDIE_URL:-}" ]; then
  echo "▶ 远端确认 $DIEDIE_URL/version.json"
  curl -s -m 8 "$DIEDIE_URL/version.json" || echo "（远端暂时没响应，稍后手动打开网址确认）"
  echo
fi
