// 双人竞技验证：进入 versus → 断言回合交替 → 反复把块放到平台最左边缘逼塔倒 →
// 断言判负归属（最后放块的队伍输）与结果面板 → 再来一局按钮可用
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
const state = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('versus');
    return s && window.__game.scene.isActive('versus')
      ? { phase: s.phase, cur: s.cur, last: s.lastDropper, blocks: s.blocks.length, outcome: s.outcome }
      : null;
  });
const waitPhase = async (want, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = await state();
    if (st && want.includes(st.phase)) return st;
    await page.waitForTimeout(200);
  }
  return null;
};

// 按住→等悬浮块 lerp 跟到手指位置→松手放块（快速 click 会在原地放块）
const dropAt = async (dx) => {
  const p = px(dx, 400);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
};

// 菜单 → 双人竞技
await click(375, 1090, 1200);
const entered = await page.evaluate(() => window.__game.scene.isActive('versus'));
console.log(`进入竞技: ${entered ? '✅' : '❌'}`);
await page.screenshot({ path: `${SHOT_DIR}/20-versus-enter.png` });

// 前两块放平台中间（验证回合交替），之后放最左边缘（x=95 明显悬空）逼塔倒
let turnLog = [];
let final = null;
for (let i = 0; i < 20; i++) {
  const st = await waitPhase(['aim', 'over']);
  if (!st) break;
  if (st.phase === 'over') {
    final = st;
    break;
  }
  turnLog.push(st.cur);
  if (i === 0) await page.screenshot({ path: `${SHOT_DIR}/21-versus-turn.png` });
  await dropAt(i === 0 ? 375 : i === 1 ? 330 : 95);
  await page.waitForTimeout(200);
  // 等本回合结束（换人横幅或分出胜负）
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const s2 = await state();
    if (!s2 || s2.phase === 'over' || (s2.phase !== 'drop' && s2.cur !== st.cur) || s2.phase === 'banner') break;
    await page.waitForTimeout(200);
  }
}
if (!final) final = await waitPhase(['over'], 8000);

// 断言
const alternates = turnLog.every((c, i) => i === 0 || c !== turnLog[i - 1]);
console.log(`回合交替 [${turnLog.join('→')}]: ${alternates && turnLog.length >= 2 ? '✅' : turnLog.length < 2 ? '⚠️ 首块就倒了' : '❌'}`);
if (final && final.outcome && !final.outcome.bothWin) {
  const blameOk = final.outcome.loser === final.last;
  console.log(`分出胜负: ✅ 胜者=队${final.outcome.winner} 败者=队${final.outcome.loser}`);
  console.log(`判负归属（败者=最后放块者）: ${blameOk ? '✅' : '❌'}`);
} else {
  console.log(`❌ ${final ? '结局异常: ' + JSON.stringify(final.outcome) : '20 块内未分出胜负'}`);
}
await page.waitForTimeout(1400); // 等结果面板弹出
await page.screenshot({ path: `${SHOT_DIR}/22-versus-over.png` });

// 再来一局 → 回到横幅/瞄准阶段且清零
await click(230, 850, 1800);
const re = await state();
console.log(`再来一局: ${re && re.phase !== 'over' && re.blocks === 0 && !re.outcome ? '✅' : '❌ ' + JSON.stringify(re)}`);

// 退出按钮回菜单
await click(375, 64, 1000);
const backMenu = await page.evaluate(() => window.__game.scene.isActive('menu'));
console.log(`✕ 退出回菜单: ${backMenu ? '✅' : '❌'}`);

console.log(errors.length ? `❌ 错误:\n` + errors.join('\n') : '✅ 无 console 错误');
await browser.close();
