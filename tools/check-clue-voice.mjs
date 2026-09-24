// 断言：force 指定线索题后，clue 语音走真实音频资源（speechSynthesis 零调用）
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
await page.addInitScript(() => {
  const empty = () => ({ level: {}, owned: [], ownedA: [] });
  localStorage.setItem('diedie-save-v2',
    JSON.stringify({ v: 2, active: 0, mode: 'animal', profiles: [empty(), empty(), empty()] }));
  window.__synthCalls = 0;
  const orig = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = (u) => { window.__synthCalls++; return orig(u); };
});
await page.goto('file:///Users/tap4fun/Demo/diedie-china/叠叠中国.html?force=a-goose-0', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const c = await page.locator('canvas').boundingBox();
await page.mouse.click(c.x + c.width / 2, c.y + (940 / 1334) * c.height);
await page.waitForTimeout(5000);
const r = await page.evaluate(() => ({ spoken: window.__spoken ?? [], synth: window.__synthCalls }));
console.log('spoken:', r.spoken.join(' | '));
console.log('synthCalls:', r.synth);
if (!r.spoken.includes('clue-a-goose-0')) throw new Error('clue 语音意图未记录');
if (r.synth > 0) throw new Error('触发了 Web Speech 兜底');
console.log('✅ clue 语音走真实音频资源');
await browser.close();
