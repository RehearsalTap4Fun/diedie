// 叠动物模式验证：菜单切模式 → 单人打一关（自动答题+放块）→ 收集入图鉴 →
// 图鉴页打开且已收集数正确 → 切回省份模式菜单恢复 → 动物模式竞技块为动物
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
const canvas = await page.locator('canvas').boundingBox();
const px = (dx, dy) => ({ x: canvas.x + (dx / 750) * canvas.width, y: canvas.y + (dy / 1334) * canvas.height });
const click = async (dx, dy, wait = 300) => {
  const p = px(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const phase = () => page.evaluate(() => window.__game.scene.getScene('game')?.phase);
const waitPhase = async (want, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (want.includes(await phase())) return true;
    await page.waitForTimeout(200);
  }
  return false;
};
const save = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('diedie-save-v2') || 'null'));

// 切到叠动物模式（胶囊右半 x≈480, y=460）
await click(480, 460, 1200);
const mode = (await save())?.mode;
console.log(`切换模式: ${mode === 'animal' ? '✅ animal' : '❌ ' + mode}`);
await page.screenshot({ path: `${SHOT_DIR}/30-menu-animal.png` });

// 大大班打一关（自动：题面挨个点选项直到进 aim，中间放块）
await click(375, 940, 1500);
const targetIsAnimal = await page.evaluate(() => {
  const s = window.__game.scene.getScene('game');
  return s?.target?.adcode?.startsWith('a-');
});
console.log(`题目为动物: ${targetIsAnimal ? '✅' : '❌'}`);
let steps = 0;
while ((await phase()) !== 'win' && steps < 60) {
  const ph = await phase();
  if (ph === 'quiz') {
    for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
      await click(sx, sy, 250);
      if (await waitPhase(['aim'], 3000)) break;
    }
  } else if (ph === 'aim') {
    await click(375, 400, 200);
    await waitPhase(['quiz', 'aim', 'win'], 15000);
  } else {
    await page.waitForTimeout(400);
  }
  steps++;
}
console.log(`过关: ${(await phase()) === 'win' ? '✅' : '❌'}`);
await page.waitForTimeout(800);
const d = await save();
const prof = d.profiles[d.active ?? 0];
const ownedA = (prof.ownedA ?? []).length;
const ownedP = (prof.owned ?? []).length;
console.log(`动物收集 ${ownedA} 个（省份收集应为 0：${ownedP === 0 ? '✅' : '❌ ' + ownedP}）`);
console.log(`动物模式关卡键 a4=${prof.level['a4']}: ${prof.level['a4'] === 2 ? '✅' : '❌'}`);
await page.screenshot({ path: `${SHOT_DIR}/31-animal-win.png` });

// 胜利面板中键 → 动物图鉴
await click(375, 825, 1200);
let inDex = await page.evaluate(() => window.__game.scene.isActive('dex'));
if (!inDex) {
  await click(375, 895, 1200);
  inDex = await page.evaluate(() => window.__game.scene.isActive('dex'));
}
console.log(`动物图鉴页: ${inDex ? '✅' : '❌'}`);
await page.screenshot({ path: `${SHOT_DIR}/32-dex.png` });
await click(375, 1230, 1000); // 返回

// 动物模式下进双人竞技，块应为动物
await click(375, 1090, 1200);
await page.waitForTimeout(2800); // 等首个回合出块
const versusAnimal = await page.evaluate(() => {
  const s = window.__game.scene.getScene('versus');
  return s?.aimProvince?.adcode?.startsWith('a-') || s?.pool?.[0]?.adcode?.startsWith('a-');
});
console.log(`竞技块为动物: ${versusAnimal ? '✅' : '❌'}`);
await page.screenshot({ path: `${SHOT_DIR}/33-versus-animal.png` });
await click(375, 64, 1000); // 退出竞技

// 切回省份模式，底部恢复地图+拼图双按钮
await click(270, 460, 1200);
const mode2 = (await save())?.mode;
console.log(`切回省份: ${mode2 === 'province' ? '✅' : '❌ ' + mode2}`);
await page.screenshot({ path: `${SHOT_DIR}/34-menu-province.png` });

console.log(errors.length ? `❌ 错误:\n` + errors.join('\n') : '✅ 无 console 错误');
await browser.close();
