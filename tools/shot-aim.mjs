// 抓放置阶段截图（验证旋转按钮布局）
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const canvas = await page.locator('canvas').boundingBox();
const pt = (dx, dy) => ({ x: canvas.x + (dx / 750) * canvas.width, y: canvas.y + (dy / 1334) * canvas.height });
const click = async (dx, dy, wait = 400) => {
  const p = pt(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const phase = () => page.evaluate(() => window.__game.scene.getScene('game')?.phase);

await click(375, 940, 1500); // 大大班
for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
  await click(sx, sy, 300);
  // 等待答对后的 2.4s 特征展示期结束
  const t0 = Date.now();
  while (Date.now() - t0 < 3200) {
    if ((await phase()) === 'aim') break;
    await page.waitForTimeout(200);
  }
  if ((await phase()) === 'aim') break;
}
await page.waitForTimeout(600);
// 点一下旋转按钮看效果
await click(375, 1282, 500);
await page.screenshot({ path: `${SHOT_DIR}/11-aim.png` });
console.log('✅ 放置阶段截图完成, phase=', await phase());
// 放下，抓下落中的「哇」表情
await click(375, 400, 260);
await page.screenshot({ path: `${SHOT_DIR}/13-falling.png` });
console.log('✅ 下落表情截图完成');
await browser.close();
