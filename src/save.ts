/**
 * 本地存档 v2：三个档案（家庭共用设备），各自独立的关卡进度与收集地图。
 * 对外 API 均作用于「当前档案」，游戏场景无需感知多档案存在。
 * v1 旧存档自动迁移到 1 号档案。隐私模式等 localStorage 不可用时静默降级。
 */
const KEY = 'diedie-save-v2';
const OLD_KEY = 'diedie-save-v1';

export const PROFILE_AVATARS = ['🐼', '🐯', '🦚'];
export const PROFILE_NAMES = ['熊猫宝宝', '老虎宝宝', '孔雀宝宝'];

/** 全局玩法模式：叠省份 / 叠动物 */
export type GameMode = 'province' | 'animal';

interface ProfileData {
  /** 每种难度各自到达的关卡；键 = 选项数，动物模式加前缀 a（'2'/'4'/'a2'/'a4'） */
  level: Record<string, number>;
  /** 已收集的省份 adcode */
  owned: string[];
  /** 已收集的动物 adcode（a-*），旧存档没有该字段，读取处 ?? [] 兜底 */
  ownedA?: string[];
}

interface SaveData {
  v: 2;
  active: number;
  profiles: ProfileData[];
  /** 全局模式（三档案共用），旧存档没有该字段视作省份模式 */
  mode?: GameMode;
}

function emptyProfile(): ProfileData {
  return { level: {}, owned: [], ownedA: [] };
}

function fresh(): SaveData {
  return { v: 2, active: 0, profiles: [emptyProfile(), emptyProfile(), emptyProfile()] };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.v === 2 && Array.isArray(d.profiles) && d.profiles.length >= 3) return d;
    }
    // v1 迁移：老进度归入 1 号档案
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old);
      if (o && o.v === 1) {
        const d = fresh();
        d.profiles[0] = { level: o.level ?? {}, owned: o.owned ?? [] };
        persist(d);
        localStorage.removeItem(OLD_KEY);
        return d;
      }
    }
  } catch {
    // ignore
  }
  return fresh();
}

function persist(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

function cur(d: SaveData): ProfileData {
  return d.profiles[d.active] ?? d.profiles[0];
}

// ---------- 档案管理 ----------

export function getActiveProfile(): number {
  return load().active;
}

export function setActiveProfile(i: number) {
  const d = load();
  d.active = Math.max(0, Math.min(PROFILE_AVATARS.length - 1, i));
  persist(d);
}

export function profileSummary(i: number): { ownedCount: number; hasAny: boolean } {
  const d = load();
  const p = d.profiles[i] ?? emptyProfile();
  const count = (p.owned ?? []).length + (p.ownedA ?? []).length;
  const hasAny = count > 0 || Object.values(p.level).some((n) => n > 1);
  return { ownedCount: count, hasAny };
}

// ---------- 全局模式 ----------

export function getMode(): GameMode {
  return load().mode ?? 'province';
}

export function setMode(m: GameMode) {
  const d = load();
  d.mode = m;
  persist(d);
}

// ---------- 当前档案读写（游戏场景使用，默认按当前模式） ----------

function levelKey(choices: number, mode: GameMode): string {
  return (mode === 'animal' ? 'a' : '') + choices;
}

export function savedLevel(choices: number, mode: GameMode = getMode()): number {
  return cur(load()).level[levelKey(choices, mode)] ?? 1;
}

export function saveLevel(choices: number, level: number, mode: GameMode = getMode()) {
  const d = load();
  const p = cur(d);
  const k = levelKey(choices, mode);
  p.level[k] = Math.max(p.level[k] ?? 1, level);
  persist(d);
}

export function getOwned(mode: GameMode = getMode()): string[] {
  const p = cur(load());
  return (mode === 'animal' ? p.ownedA : p.owned) ?? [];
}

export function addOwned(adcodes: string[], mode: GameMode = getMode()) {
  const d = load();
  const p = cur(d);
  const key = mode === 'animal' ? 'ownedA' : 'owned';
  const set = new Set(p[key] ?? []);
  adcodes.forEach((a) => set.add(a));
  p[key] = [...set];
  persist(d);
}

export function hasProgress(): boolean {
  const d = load();
  const p = cur(d);
  return (
    Object.values(p.level).some((n) => n > 1) ||
    (p.owned ?? []).length > 0 ||
    (p.ownedA ?? []).length > 0
  );
}

/** 只重置当前档案，不影响其他小朋友 */
export function resetProgress() {
  const d = load();
  d.profiles[d.active] = emptyProfile();
  persist(d);
}
