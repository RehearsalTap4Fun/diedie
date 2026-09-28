// 生成 PWA 图标（public/icons/）：由 public/icons/icon.svg 渲染 180/192/512 三个尺寸。
// 手绘风与饮食日记、同路同一套语言（天蓝底、墨色描边、三块积木叠过目标线）；页面 favicon 直接用 icon.svg。
// 用法：node tools/build-icons.mjs（依赖本机 Chrome）
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', OUT), 'utf8');
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: new URL(`icon-${size}.png`, OUT).pathname });
}
await browser.close();
console.log('✓ public/icons/icon-{180,192,512}.png');
