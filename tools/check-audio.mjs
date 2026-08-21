// 验证预生成音频在页面里真实播放（拦截 Audio.play 记录结果）
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
await page.addInitScript(() => {
  window.__played = [];
  const orig = Audio.prototype.play;
  Audio.prototype.play = function () {
    const p = orig.call(this);
    p.then(() => window.__played.push('ok:' + this.src.slice(0, 40))).catch((e) =>
      window.__played.push('fail:' + e.name)
    );
    return p;
  };
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const canvas = await page.locator('canvas').boundingBox();
// 点大大班开始，触发出题语音
await page.mouse.click(canvas.x + (375 / 750) * canvas.width, canvas.y + (940 / 1334) * canvas.height);
await page.waitForTimeout(2500);
const played = await page.evaluate(() => window.__played);
console.log('Audio.play 记录:', JSON.stringify(played));
const ok = played.some((s) => s.startsWith('ok:data:audio') || s.startsWith('ok:blob') || s.startsWith('ok:'));
console.log(ok ? '✅ 预生成音频播放成功' : '❌ 音频未播放');
await browser.close();
process.exit(ok ? 0 : 1);
