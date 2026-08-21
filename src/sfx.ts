/**
 * 音效播放：tools/build-sfx.mjs 生成的短音效（单文件构建时内联为 data URI）。
 * 与语音（speak.ts）互不打断；音效之间允许叠放；同名音效做最小间隔节流。
 */
const files = import.meta.glob('./assets/sfx/*.m4a', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byId: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) {
  const m = p.match(/\/([^/]+)\.m4a$/);
  if (m) byId[m[1]] = url;
}

const VOLUMES: Record<string, number> = {
  rotate: 0.5,
  whoosh: 0.5,
  boing: 0.7,
  thud: 0.35,
};

const lastPlay: Record<string, number> = {};

export function sfx(id: string, minGapMs = 120) {
  const url = byId[id];
  if (!url) return;
  const now = Date.now();
  if (now - (lastPlay[id] ?? 0) < minGapMs) return;
  lastPlay[id] = now;
  try {
    const a = new Audio(url);
    a.volume = VOLUMES[id] ?? 0.6;
    a.play().catch(() => {
      /* 未解锁音频等场景静默 */
    });
  } catch {
    /* ignore */
  }
}
