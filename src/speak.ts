/**
 * 语音播放：优先播放预生成的 TTS 音频（tools/build-voice.mjs 产出，
 * 单文件构建时以 data URI 内联），缺失或真实播放失败时回退浏览器 SpeechSynthesis。
 *
 * 注意：主动打断（新语音顶替旧语音）产生的 AbortError 不算失败，
 * 不能触发兜底——否则会出现合成音与音频双声重叠。
 */
import VOICE_TEXT from './data/voice.json';

const files = import.meta.glob('./assets/voice/*.m4a', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byId: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) {
  const m = p.match(/\/([^/]+)\.m4a$/);
  if (m) byId[m[1]] = url;
}

let current: HTMLAudioElement | null = null;
let queued: (() => void) | null = null;

/** 按文案 ID 播放。queue: true 时等当前语音播完再播（只保留最新一条排队） */
export function speakId(id: string, opts?: { queue?: boolean }) {
  const url = byId[id];
  const text = (VOICE_TEXT as Record<string, string>)[id];
  if (!url) {
    fallbackTTS(text);
    return;
  }
  const playNow = () => {
    try {
      if (current) {
        current.pause();
        current = null;
      }
      const a = new Audio(url);
      current = a;
      const finish = () => {
        if (current === a) {
          current = null;
          const q = queued;
          queued = null;
          q?.();
        }
      };
      a.onended = finish;
      a.onerror = finish;
      a.play().catch((e: unknown) => {
        // 被新语音顶替，或 pause 打断的 AbortError：属正常流转，不回退
        if (current !== a) return;
        if ((e as Error)?.name === 'AbortError') return;
        fallbackTTS(text);
      });
    } catch {
      fallbackTTS(text);
    }
  };

  if (opts?.queue && current && !current.paused && !current.ended) {
    queued = playNow;
  } else {
    queued = null;
    playNow();
  }
}

function fallbackTTS(text?: string) {
  if (!text) return;
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  } catch {
    // 语音不可用不影响游玩
  }
}
