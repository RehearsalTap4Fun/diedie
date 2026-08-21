import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 单文件构建：JS/数据全部内联进一个 HTML，双击即玩（file:// 协议），无需服务器
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    chunkSizeWarningLimit: 4096,
  },
});
