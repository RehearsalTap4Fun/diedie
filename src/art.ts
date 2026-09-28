import Phaser from 'phaser';

/**
 * 线索插画资源（扁平可爱风手绘 SVG）：src/assets/art/{adcode}-{idx}.svg，
 * 与 clues.json 的线索按 ID 对应；以纯文本内联，运行时转 base64 注册为纹理。
 * （不走 Phaser 的 load.svg：它会把 data URI 一律按 base64 atob，而 Vite
 * 内联的是 percent-encoding，会直接抛 InvalidCharacterError。）
 * 未覆盖的线索在展示层自动回退 emoji 占位。
 */
const files = import.meta.glob('./assets/art/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// 古文字（叠汉字演变动画的中间一环）：src/assets/ancient/{adcode}.svg，来自 Wikimedia Commons
// 「Ancient Chinese characters」项目（公有领域），由 tools/prep-ancient.mjs 统一着色与去元数据
const ancient = import.meta.glob('./assets/ancient/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

let installed = false;

/** 把全部插画注册为纹理（key 形如 art-510000-0），幂等 */
export function installArtTextures(scene: Phaser.Scene) {
  if (installed) return;
  installed = true;
  for (const [p, raw] of Object.entries(files)) {
    const id = p.match(/\/([^/]+)\.svg$/)![1];
    // SVG 只有 viewBox 时浏览器默认按 300x150 光栅化，注入显式尺寸
    const svg = raw.replace('<svg ', '<svg width="300" height="300" ');
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    scene.textures.addBase64(`art-${id}`, `data:image/svg+xml;base64,${b64}`);
  }
  for (const [p, raw] of Object.entries(ancient)) {
    const id = p.match(/\/([^/]+)\.svg$/)![1];
    const svg = raw.replace('<svg ', '<svg width="300" height="300" ');
    scene.textures.addBase64(`ancient-${id}`, `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`);
  }
}
