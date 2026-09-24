// 生成 PWA 图标（public/icons/）：天蓝底 + 🧸，与页面 favicon 一致。
// 用法：node tools/build-icons.mjs（依赖本机 Chrome）
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  // 图标主体留在中间 ~60% 内，maskable 裁切（安全区 80% 圆）也不会切到
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;
    background:#7ec8e3;display:flex;align-items:center;justify-content:center">
    <span style="font-size:${Math.round(size * 0.58)}px;line-height:1">🧸</span></body></html>`);
  await page.screenshot({ path: new URL(`icon-${size}.png`, OUT).pathname });
}
await browser.close();
console.log('✓ public/icons/icon-{180,192,512}.png');
