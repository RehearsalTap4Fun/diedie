// M0 完整通关冒烟测试：自动答题+中心落点堆叠直到过关，校验胜利结算路径
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const canvas = await page.locator('canvas').boundingBox();
const pt = (dx, dy) => ({ x: canvas.x + (dx / 750) * canvas.width, y: canvas.y + (dy / 1334) * canvas.height });
const click = async (dx, dy, wait = 400) => {
  const p = pt(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const phase = () =>
  page.evaluate(() => {
    const g = window.__game;
    const s = g && g.scene.getScene('game');
    return s && s.scene.isActive() ? s.phase : 'menu';
  });
const waitPhase = async (want, timeoutMs = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ph = await phase();
    if (want.includes(ph)) return ph;
    await page.waitForTimeout(200);
  }
  return await phase();
};

await click(375, 940, 1200); // 大大班

async function playUntilWin(maxSteps = 80) {
  let steps = 0;
  let ph = await waitPhase(['quiz']);
  while (ph !== 'win' && steps < maxSteps) {
    if (ph === 'quiz') {
      // 依次点选项，答对后 480ms 才切相位，所以每次点完都等相位确认
      for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
        await click(sx, sy, 250);
        // 答对后有 2.4s 特征卡片展示期，等它切到放置相位再继续
        const now = await waitPhase(['aim'], 3000);
        if (now === 'aim') break;
      }
    } else if (ph === 'aim') {
      await click(375, 400, 200); // 固定中心落点，垂直往上堆
      await waitPhase(['quiz', 'aim', 'win'], 15000); // 等静止结算
    } else {
      await page.waitForTimeout(500);
    }
    ph = await phase();
    steps++;
  }
  return { ph, steps };
}

// 第 1 关
const r1 = await playUntilWin();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT_DIR}/5-final.png` });
console.log(`第 1 关: ${r1.ph}（${r1.steps} 步）`);

// 过关后点「下一关」，校验关卡与目标线递进
// 胜利面板有单排（按钮 y=825）/双排（y=895）两种布局，先后尝试
let level2ok = false;
if (r1.ph === 'win') {
  await click(160, 825, 1200);
  let st = await page.evaluate(() => {
    const s = window.__game.scene.getScene('game');
    return { level: s.level, lineY: s.lineY, platformW: s.platformW, phase: s.phase };
  });
  if (st.level !== 2) {
    await click(160, 895, 1500);
    st = await page.evaluate(() => {
      const s = window.__game.scene.getScene('game');
      return { level: s.level, lineY: s.lineY, platformW: s.platformW, phase: s.phase };
    });
  }
  level2ok = st.level === 2 && st.lineY === 670 && st.platformW === 570;
  console.log(
    `下一关: level=${st.level} lineY=${st.lineY} platformW=${st.platformW} ${level2ok ? '✅' : '❌ 预期 level=2 lineY=670 platformW=570'}`
  );
}

// 第 2 关也要能打通（新难度曲线下的可玩性验证）
let level2win = false;
if (level2ok) {
  const r2 = await playUntilWin();
  level2win = r2.ph === 'win';
  console.log(`第 2 关: ${r2.ph}（${r2.steps} 步）${level2win ? '✅' : '❌'}`);
  await page.waitForTimeout(1600); // 等新收集省份的弹出动画播完
  await page.screenshot({ path: `${SHOT_DIR}/7-level2.png` });
}

// 刷新页面校验本地存档（v2 多档案）：当前档案应记住关卡与收集的省份
let persistOk = false;
if (level2win) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const parsed = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('diedie-save-v2') || '{}')
  );
  const prof = parsed.profiles?.[parsed.active ?? 0] ?? {};
  persistOk = (prof.level?.['4'] ?? 1) >= 3 && (prof.owned?.length ?? 0) >= 3;
  console.log(
    `存档: active=${parsed.active} level=${JSON.stringify(prof.level)} owned=${prof.owned?.length} ${persistOk ? '✅' : '❌ 预期当前档案 level.4>=3 且 owned>=3'}`
  );
  await page.screenshot({ path: `${SHOT_DIR}/8-menu-continue.png` });
}

// 档案切换：点 3 号头像（孔雀）应切到空档案，再切回
let profileOk = false;
if (persistOk) {
  await click(505, 158, 1000);
  const s1 = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('diedie-save-v2') || '{}');
    return { active: d.active, owned: d.profiles?.[2]?.owned?.length ?? -1 };
  });
  await click(245, 158, 1000);
  const s2 = await page.evaluate(
    () => JSON.parse(localStorage.getItem('diedie-save-v2') || '{}').active
  );
  profileOk = s1.active === 2 && s1.owned === 0 && s2 === 0;
  console.log(
    `档案切换: 切到3号(active=${s1.active}, owned=${s1.owned}) 切回1号(active=${s2}) ${profileOk ? '✅' : '❌'}`
  );
}

// 打开「我的地图」页（菜单底部左侧按钮）
let mapOk = false;
if (persistOk) {
  await click(212, 1225, 1500);
  mapOk = await page.evaluate(() => window.__game.scene.isActive('map'));
  console.log(`地图页: ${mapOk ? '✅' : '❌ 未进入 map 场景'}`);
  await page.screenshot({ path: `${SHOT_DIR}/12-map.png` });
}

console.log(errors.length ? `❌ 错误 ${errors.length} 条:\n` + errors.join('\n') : '✅ 无控制台错误');
await browser.close();
process.exit(
  r1.ph === 'win' && level2ok && level2win && persistOk && profileOk && mapOk && errors.length === 0
    ? 0
    : 1
);
