// 物理轮廓体检：在真实游戏页面里用 Matter 把每个省份/动物/汉字的每组物理轮廓都建一次刚体，
// 检查：能否建体（Matter 在凸分解失败时会返回空）、有无 quickDecomp 告警、质心有限、
// 部件面积与原多边形面积相符（±35%）。用法：先 npm run dev，再 URL=http://localhost:5173/ node tools/check-phys.mjs
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
const warns = [];
page.on('console', (m) => {
  if (/quickDecomp|凸分解失败|无法建体/.test(m.text())) warns.push(m.text());
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const res = await page.evaluate(async () => {
  const T = await import('/src/types.ts');
  const M = window.__game.scene.getScene('menu').matter;
  const bad = [];
  let n = 0;
  for (const p of [...T.PROVINCES, ...T.ANIMALS, ...T.CHARS]) {
    const sets = (p.physParts ?? [p.phys]).map((r) => r.map(([x, y]) => ({ x, y })));
    sets.forEach((set, i) => {
      n++;
      const before = window.__warnCount ?? 0;
      const c = M.vertices.centre(set);
      const b = M.bodies.fromVertices(c.x, c.y, [set], {}, true, 0.01, 10);
      const want = Math.abs(M.vertices.area(set, true));
      if (!b) return bad.push(`${p.display}#${i}：Matter 返回空刚体`);
      if (!Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)) bad.push(`${p.display}#${i}：质心无效`);
      const got = b.parts.length > 1 ? b.parts.slice(1).reduce((s, q) => s + q.area, 0) : b.area;
      if (Math.abs(got - want) / want > 0.35) bad.push(`${p.display}#${i}：面积 ${got.toFixed(0)} vs ${want.toFixed(0)}`);
      void before;
    });
  }
  return { n, bad };
});
await browser.close();
if (warns.length) res.bad.push(...warns.map((w) => `控制台告警：${w}`));
if (res.bad.length) {
  console.error(`❌ ${res.bad.length} 个问题（共检查 ${res.n} 组轮廓）：\n` + res.bad.join('\n'));
  process.exit(1);
}
console.log(`✅ 物理轮廓全部可建体（${res.n} 组，无凸分解告警）`);
