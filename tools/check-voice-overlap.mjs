// 双语音重叠回归：预置第 2 关存档 → 进游戏（sys-higher + 题目语音先后触发）
// 断言：speechSynthesis 零调用（无兜底误触发）、两条音频顺序播放而非同时
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
await page.addInitScript(() => {
  window.__audio = [];
  window.__synth = 0;
  const orig = Audio.prototype.play;
  Audio.prototype.play = function () {
    window.__audio.push(Date.now());
    return orig.call(this);
  };
  const so = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
  if (so) window.speechSynthesis.speak = (u) => { window.__synth++; return so(u); };
  // 预置存档：大大班已到第 2 关
  localStorage.setItem(
    'diedie-save-v2',
    JSON.stringify({ v: 2, active: 0, profiles: [{ level: { 4: 2 }, owned: ['510000'] }, { level: {}, owned: [] }, { level: {}, owned: [] }] })
  );
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const canvas = await page.locator('canvas').boundingBox();
// 点大大班（显示继续第 2 关）
await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + (940 / 1334) * canvas.height);
await page.waitForTimeout(4000);
const r = await page.evaluate(() => ({ audio: window.__audio, synth: window.__synth }));
const gap = r.audio.length >= 2 ? r.audio[1] - r.audio[0] : -1;
console.log(`音频播放 ${r.audio.length} 次（间隔 ${gap}ms），speechSynthesis 调用 ${r.synth} 次`);
// sys-higher 约 1.5-2s，排队后第二条应在 1 秒以上之后才播；合成音必须为 0
const ok = r.synth === 0 && r.audio.length >= 2 && gap > 1000;
console.log(ok ? '✅ 无双语音重叠，顺序播放正常' : '❌ 仍有重叠或兜底误触发');
await browser.close();
process.exit(ok ? 0 : 1);