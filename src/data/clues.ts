/**
 * 线索题库（M1）：数据在 clues.json（与语音管线 tools/build-voice.mjs 共用），
 * 本文件只提供类型包装。emoji 为占位视觉，M2 替换为 AI 插画。
 */
import raw from './clues.json';

export interface Clue {
  /** 占位图形（emoji） */
  e: string;
  /** 题面 + 语音文案 */
  q: string;
}

export const CLUES = raw as unknown as Record<string, Clue[]>;
