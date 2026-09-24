// 声音设置验证：⚙️ 打开面板 → 关闭「点击播报」和「叠叠音效」→ 断言持久化 →
// 图鉴点击不再播报（__spoken 无 intro-）→ 答题语音仍正常 → 重开后开关状态保留
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// 预置：动物模式 + 已收集两只（图鉴点击测试用）
await page.evaluate(() => {
  localStorage.setItem('diedie-save-v2', JSON.stringify({ v: 2, active: 0, mode: 'animal',
    profiles: [{ level: {}, owned: [], ownedA: ['a-cat', 'a-dog'] }, { level: {}, owned: [], ownedA: [] }, { level: {}, owned: [], ownedA: [] }] }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const canvas = await page.locator('canvas').boundingBox();
const px = (dx, dy) => ({ x: canvas.x + (dx / 750) * canvas.width, y: canvas.y + (dy / 1334) * canvas.height });
const click = async (dx, dy, wait = 400) => {
  const p = px(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const sound = () => page.evaluate(() => JSON.parse(localStorage.getItem('diedie-save-v2')).sound ?? {});
const spoken = () => page.evaluate(() => (window.__spoken ?? []).slice());

// 打开设置面板
await click(64, 64, 800);
await page.screenshot({ path: `${SHOT_DIR}/40-sound-settings.png` });
// 关闭「点击播报」（第 3 行 y=737）与「叠叠音效」（第 4 行 y=833）
await click(560, 737, 400);
await click(560, 833, 400);
const s1 = await sound();
console.log(`持久化: ${s1.tap === false && s1.sfx === false ? '✅' : '❌ ' + JSON.stringify(s1)}`);
await page.screenshot({ path: `${SHOT_DIR}/41-sound-toggled.png` });
await click(375, 918, 800); // 好的

// 图鉴点击：不应播报（tap 频道已关）
await page.evaluate(() => { window.__spoken = []; });
await click(375, 1225, 1200); // 动物图鉴（进入播报 sys-dex 也属 tap，应静默）
await click(97, 289, 800); // 第一格（小猫，已收集）
const sp1 = await spoken();
const tapMuted = !sp1.some((id) => id.startsWith('intro-') || id.startsWith('sys-dex') || id === 'sys-locked');
console.log(`图鉴点击已静音: ${tapMuted ? '✅' : '❌ ' + JSON.stringify(sp1)}`);
await click(375, 1230, 1000); // 返回

// 答题语音（quiz 频道未关）应正常
await page.evaluate(() => { window.__spoken = []; });
await click(375, 940, 2200); // 开始闯关
const sp2 = await spoken();
const quizOn = sp2.some((id) => id.startsWith('q-name-') || id.startsWith('clue-'));
console.log(`答题语音仍播报: ${quizOn ? '✅' : '❌ ' + JSON.stringify(sp2)}`);

// 刷新后开关状态保留且面板显示一致
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const s2 = await sound();
console.log(`刷新后保留: ${s2.tap === false && s2.sfx === false ? '✅' : '❌ ' + JSON.stringify(s2)}`);
// 重新打开面板把两项恢复
await click(64, 64, 800);
await click(560, 737, 400);
await click(560, 833, 400);
const s3 = await sound();
console.log(`可恢复开启: ${s3.tap === true && s3.sfx === true ? '✅' : '❌ ' + JSON.stringify(s3)}`);

console.log(errors.length ? `❌ 错误:\n` + errors.join('\n') : '✅ 无 console 错误');
await browser.close();
