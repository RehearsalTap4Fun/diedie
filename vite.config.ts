import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { swPlugin } from './tools/sw-plugin.mjs';

const now = new Date();
const two = (n: number) => String(n).padStart(2, '0');
// 本地时间 YYYYMMDDHHmm，和 npm run deploy 打印的一致
const buildId = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}${two(now.getHours())}${two(now.getMinutes())}`;

// 两种产物：
// - 默认（npm run build）：单文件构建，JS/数据/语音全部内联进一个 HTML，双击即玩（file:// 协议）
// - --mode web（npm run build:web）：多文件 PWA，语音/音效按文件名哈希拆出来长缓存，
//   service worker 预缓存全部资源，首次打开后可离线、可装到主屏幕；产物在 dist-web/
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    base: './',
    publicDir: web ? 'public' : false,
    plugins: web ? [swPlugin({ version: buildId })] : [viteSingleFile()],
    define: {
      __PWA__: JSON.stringify(web),
      __BUILD_ID__: JSON.stringify(buildId),
    },
    build: {
      outDir: web ? 'dist-web' : 'dist',
      chunkSizeWarningLimit: 4096,
      // web 版不内联小音频：全部走哈希文件，方便 SW 预缓存与长缓存
      ...(web ? { assetsInlineLimit: 0 } : {}),
    },
  };
});
