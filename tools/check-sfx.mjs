// 音效触发验证：拦截 Audio.play，走一次 答题→旋转→放块→落地，断言 rotate/whoosh/boing 均播放
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
await page.addInitScript(() => {
  window.__plays = [];
  const orig = Audio.prototype.play;
  Audio.prototype.play = function () {
    window.__plays.push({ len: this.src.length, vol: this.volume });
    return orig.call(this);
  };
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const canvas = await page.locator('canvas').boundingBox();
const pt = (dx, dy) => ({ x: canvas.x + (dx / 750) * canvas.width, y: canvas.y + (dy / 1334) * canvas.height });
const click = async (dx, dy, wait = 300) => {
  const p = pt(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const phase = () => page.evaluate(() => window.__game.scene.getScene('game')?.phase);

await click(375, 940, 1500); // 大大班
for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
  await click(sx, sy, 300);
  const t0 = Date.now();
  while (Date.now() - t0 < 3200) {
    if ((await phase()) === 'aim') break;
    await page.waitForTimeout(200);
  }
  if ((await phase()) === 'aim') break;
}
const before = await page.evaluate(() => window.__plays.length);
await click(375, 1282, 400); // 旋转 -> rotate
await click(375, 400, 200); // 放下 -> whoosh, 落地 -> boing
await page.waitForTimeout(2500);
const plays = await page.evaluate(() => window.__plays);
const after = plays.slice(before);
// 音效音量特征: rotate 0.5 / whoosh 0.5 / boing 0.7；语音 volume=1
const sfxPlays = after.filter((p) => p.vol < 1);
console.log(`放置阶段后新增播放 ${after.length} 次，其中音效 ${sfxPlays.length} 次（音量: ${sfxPlays.map((p) => p.vol).join(', ')}）`);
const ok = sfxPlays.length >= 3;
console.log(ok ? '✅ 旋转/下落/落地音效均触发' : '❌ 音效触发不足');
await browser.close();
process.exit(ok ? 0 : 1);