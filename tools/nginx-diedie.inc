# 叠叠中国 web 版的 nginx 规则：粘进服务器 /etc/nginx/conf.d/nutri-site.inc，
# 放在 `location / { ... }` 之前，然后 sudo nginx -t && sudo systemctl reload nginx。
# （不加也能访问——总站的 location / 会兜底，只是没有下面这些缓存策略）
    location = /diedie { return 301 /diedie/; }
    location = /diedie/ { add_header Cache-Control "no-cache"; try_files /diedie/index.html =404; }
    location = /diedie/index.html { add_header Cache-Control "no-cache"; }
    location = /diedie/sw.js { add_header Cache-Control "no-cache"; }
    location = /diedie/version.json { add_header Cache-Control "no-cache"; }
    location = /diedie/manifest.webmanifest { types { } default_type application/manifest+json; add_header Cache-Control "max-age=3600"; }
    location /diedie/assets/ { types { audio/mp4 m4a; application/javascript js; } add_header Cache-Control "public, max-age=31536000, immutable"; }
    location /diedie/icons/ { add_header Cache-Control "max-age=2592000"; }
    location /diedie/ { try_files $uri =404; }
