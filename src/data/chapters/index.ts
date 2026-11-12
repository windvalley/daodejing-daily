import type { Chapter } from './types'
import { chapters1to20 } from './part1'
import { chapters21to40 } from './part2'
import { chapters41to60 } from './part3'
import { chapters61to81 } from './part4'

export type { Chapter, ChapterNote, Section } from './types'

export const chapters: Chapter[] = [...chapters1to20, ...chapters21to40, ...chapters41to60, ...chapters61to81].sort(
  (a, b) => a.number - b.number,
)

export const chapterMap = new Map<number, Chapter>(chapters.map((chapter) => [chapter.number, chapter]))

export function getChapter(number: number): Chapter | undefined {
  return chapterMap.get(number)
}

export const sections = [
  { id: 'dao', name: '道经', subtitle: '第一章至第三十七章', range: [1, 37] as const },
  { id: 'de', name: '德经', subtitle: '第三十八章至第八十一章', range: [38, 81] as const },
]

/** 去掉标点与空白后的纯文本，用于背诵比对与检索 */
export function plainText(chapter: Chapter): string {
  return chapter.text.join('').replace(/[，。；：！？、“”‘’《》（）\s]/g, '')
}

export const chapterLabel = (number: number): string => `第${number}章`
