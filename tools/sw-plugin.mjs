import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * web 构建结束时生成 dist-web/sw.js 与 version.json。
 * 策略：
 * - 安装时预缓存全部产物（含 480+ 条语音，约 8MB，后台进行，不阻塞首次游玩）→ 首次打开后整站可离线
 * - 页面导航网络优先（联网总拿到最新版），断网回退缓存
 * - 其余资源缓存优先：assets/ 下文件名带内容哈希，内容永不变
 * - 缓存名带构建号，新版激活后清掉旧缓存；deploy.sh 同步时保留服务器上的旧哈希文件，
 *   发版瞬间仍开着的旧页面照样能从网络取到旧语音
 */
export function swPlugin({ version }) {
  let outDir = 'dist-web';
  return {
    name: 'diedie-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    // 只给 web 版注入安装相关标签，单文件版保持零外部引用
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="./icons/icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="叠叠中国" />
    <meta name="theme-color" content="#7ec8e3" />`,
      );
    },
    closeBundle() {
      const files = [];
      const walk = (d) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (!/\.DS_Store$/.test(f)) files.push('./' + relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const precache = ['./', ...files.filter((f) => f !== './version.json')];
      const sw = `// 叠叠中国 service worker · build ${version}
const CACHE = 'diedie-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('diedie-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); }
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || new Response('离线且无缓存', { status: 503 }))),
    );
    return;
  }
  // Safari 播 <audio> 会带 Range 头，且不接受整段 200 回应，命中缓存时切片回 206
  const range = req.headers.get('range');
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit ? (range ? partial(hit, range) : hit) : fetch(req).then((res) => {
      if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});

async function partial(res, range) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\\d*)-(\\d*)/.exec(range);
  let start = m && m[1] ? +m[1] : 0;
  let end = m && m[2] ? +m[2] : buf.byteLength - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, buf.byteLength - +m[2]); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + buf.byteLength } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mp4',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.byteLength,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
`;
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version }));
    },
  };
}
