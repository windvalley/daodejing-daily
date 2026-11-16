import type { Chapter } from '../chapters/types'
import { glosses1to20 } from './part1'
import type { ChapterGloss } from './types'

export type { ChapterGloss, CharGloss, GlossLine } from './types'

const glossMap = new Map<number, ChapterGloss>(
  Object.entries(glosses1to20).map(([number, gloss]) => [Number(number), gloss]),
)

/** 取一章的逐字注音与解析，没有录入时返回 undefined */
export function getChapterGloss(number: number): ChapterGloss | undefined {
  return glossMap.get(number)
}

/** 有释义的汉字数，标点不计 */
export function glossCharCount(gloss: ChapterGloss): number {
  return gloss.reduce((total, line) => total + line.filter((token) => token.gloss).length, 0)
}

/** 注音条目是否与章文逐句、逐字对齐 */
export function glossMatchesChapter(gloss: ChapterGloss, chapter: Chapter): boolean {
  if (gloss.length !== chapter.text.length) return false
  return gloss.every((line, index) => line.map((token) => token.char).join('') === chapter.text[index])
}
