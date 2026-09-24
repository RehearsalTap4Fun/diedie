// 抓动物线索题在答题面板中的实际效果（预置动物模式存档 + ?force=<线索ID>）
import { chromium } from 'playwright-core';

const BASE = process.env.URL || 'http://localhost:5173/';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';
const IDS = (
  process.env.IDS || 'a-panda-0,a-panda-1,a-tiger-0,a-tiger-1,a-rabbit-0,a-rabbit-1'
).split(',');

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
for (const id of IDS) {
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  await page.addInitScript(() => {
    const empty = () => ({ level: {}, owned: [], ownedA: [] });
    localStorage.setItem(
      'diedie-save-v2',
      JSON.stringify({ v: 2, active: 0, mode: 'animal', profiles: [empty(), empty(), empty()] })
    );
  });
  await page.goto(`${BASE}?force=${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + (940 / 1334) * canvas.height);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/clue-${id}.png` });
  console.log(`✅ ${id}`);
  await page.close();
}
await browser.close();
