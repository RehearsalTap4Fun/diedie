import raw from './data/provinces.json';
import rawAnimals from './data/animals.json';
import rawChars from './data/chars.json';
import { getMode } from './save';

export interface Province {
  adcode: string;
  name: string;
  display: string;
  short: string;
  color: string;
  /** 以面积质心为原点的轮廓顶点（px，y 向下） */
  verts: [number, number][];
  /** 物理碰撞轮廓：重度简化+向凸包收拢，与 verts 同一坐标系 */
  phys: [number, number][];
  /** 表情锚点（保证在轮廓内部） */
  face: [number, number];
  eyeR: number;
  /** 眼周黑眼圈（大熊猫）：表情级特征，不改变外形 */
  patch?: boolean;
  /** 身上的黑白花纹（大熊猫：耳朵/眼圈/四肢/肩带），与 verts 同一坐标系的若干多边形；只上色不改外形 */
  pattern?: [number, number][][];
  /** 多块/带洞形状（汉字）：每个笔画块一份，fill 为洞已用零宽缝接入的可填充单环，
   *  rings 为外圈 + 各洞，用于描边。有 parts 时 verts 只是凸包（包围盒/占位用） */
  parts?: { fill: [number, number][]; rings: [number, number][][] }[];
  /** 多块物理轮廓（汉字每个笔画块一份），合成一个刚体；缺省用 phys */
  physParts?: [number, number][][];
  /** 包围盒 [宽, 高] */
  size: [number, number];
}

export const PROVINCES = raw as unknown as Province[];

/** 叠动物模式的形状集：schema 与省份完全一致（adcode 为 a-* 前缀） */
export const ANIMALS = rawAnimals as unknown as Province[];

/** 叠汉字模式的形状集：24 个象形字（adcode 为 c-* 前缀），带 parts/physParts */
export const CHARS = rawChars as unknown as Province[];

/** 当前全局模式对应的形状集（省份 / 动物 / 汉字） */
export function activeShapes(): Province[] {
  const m = getMode();
  return m === 'animal' ? ANIMALS : m === 'char' ? CHARS : PROVINCES;
}
