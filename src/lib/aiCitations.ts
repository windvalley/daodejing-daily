/**
 * 回答里的引用校验。
 *
 * 模型最容易犯的错不是胡说义理，而是编一句「老子在第四十二章说」然后把话塞进去。
 * 这类错误读起来完全合理，人工很难发现。判定办法和 src/test/data.test.ts 校验概念引文一致：
 * 去掉标点后在对应章原文里做子串匹配，匹配不上就标注出来。
 */

import { chapters, getChapter } from '../data/chapters'
import { normalize } from './memorize'

export interface CitationQuote {
  /** 回答里引号中的原文片段，保留原样 */
  text: string
  /** 能对上的章号，对不上为 null */
  chapter: number | null
  verified: boolean
}

export interface CitationReport {
  /** 回答里点到的章号，去重并按出现顺序排列，只保留书中存在的章 */
  chapters: number[]
  /** 引号里的片段及其核实结果 */
  quotes: CitationQuote[]
  /** 对不上原文的引用条数 */
  unverified: number
}

const CN_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 把「八十一」这类章号写法转成数字，只处理一到九十九 */
export function chineseChapterNumber(input: string): number | null {
  const text = input.trim()
  if (!text) return null
  if (/^\d{1,2}$/.test(text)) return Number(text)
  if (!/^[一二三四五六七八九十]+$/.test(text)) return null
  if (text === '十') return 10
  const tens = text.indexOf('十')
  if (tens < 0) return text.length === 1 ? (CN_DIGITS[text] ?? null) : null
  const high = tens === 0 ? 1 : CN_DIGITS[text[tens - 1]]
  const low = text.length > tens + 1 ? CN_DIGITS[text[tens + 1]] : 0
  if (high === undefined || low === undefined) return null
  return high * 10 + low
}

/** 回答里点到的章号，支持「第 12 章」「第十二章」两种写法 */
export function extractChapterRefs(answer: string): number[] {
  const found: number[] = []
  const pattern = /第\s*(\d{1,2}|[一二三四五六七八九十]+)\s*章/g
  let match = pattern.exec(answer)
  while (match) {
    const number = chineseChapterNumber(match[1])
    if (number && number >= 1 && number <= chapters.length && !found.includes(number)) found.push(number)
    match = pattern.exec(answer)
  }
  return found
}

const QUOTE_PATTERNS = [/「([^」]{2,80})」/g, /“([^”]{2,80})”/g, /"([^"]{2,80})"/g]

/** 抽取引号里的片段。同一句用不同引号重复出现只留一次 */
export function extractQuotes(answer: string): string[] {
  const found: string[] = []
  QUOTE_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0
    let match = pattern.exec(answer)
    while (match) {
      const quote = match[1].trim()
      if (quote && !found.includes(quote)) found.push(quote)
      match = pattern.exec(answer)
    }
  })
  return found
}

const CJK = /[\u4e00-\u9fa5]/g

/**
 * 太短的片段不判。
 * 「无为」「自然」这类词本身就是术语，模型用引号强调很常见，判成编造只会制造噪音。
 */
function isCheckable(quote: string): boolean {
  const plain = normalize(quote)
  return plain.length >= 4 && (plain.match(CJK)?.length ?? 0) >= 3
}

let normalizedTexts: Map<number, string> | null = null

function chapterTexts(): Map<number, string> {
  if (normalizedTexts === null) {
    normalizedTexts = new Map(chapters.map((chapter) => [chapter.number, normalize(chapter.text.join(''))]))
  }
  return normalizedTexts
}

/** 逐章查找引文，返回第一个包含它的章号 */
export function findQuoteChapter(quote: string): number | null {
  const plain = normalize(quote)
  if (!plain) return null
  for (const [number, text] of chapterTexts()) {
    if (text.includes(plain)) return number
  }
  return null
}

/**
 * 校验一条回答。
 * 章号只保留书中真实存在的，引号片段逐条回溯原文，对不上的计入 unverified。
 */
export function checkCitations(answer: string): CitationReport {
  const chaptersInAnswer = extractChapterRefs(answer)
  const quotes: CitationQuote[] = []
  extractQuotes(answer).forEach((quote) => {
    if (!isCheckable(quote)) return
    const chapter = findQuoteChapter(quote)
    quotes.push({ text: quote, chapter, verified: chapter !== null })
  })
  return {
    chapters: chaptersInAnswer,
    quotes,
    unverified: quotes.filter((quote) => !quote.verified).length,
  }
}

/** 界面提示文案。引用全部对得上时返回 null，不打扰读者 */
export function citationNotice(report: CitationReport): string | null {
  if (!report.quotes.length) return null
  if (report.unverified === 0) return null
  return `有 ${report.unverified} 处引文未在原文中找到，请以章页原文为准。`
}

/** 回答里点到但书里没有的章号，用于给模型纠错，不弹给读者 */
export function unknownChapterRefs(answer: string): number[] {
  const found: number[] = []
  const pattern = /第\s*(\d{1,3})\s*章/g
  let match = pattern.exec(answer)
  while (match) {
    const number = Number(match[1])
    if (number >= 1 && !getChapter(number) && !found.includes(number)) found.push(number)
    match = pattern.exec(answer)
  }
  return found
}
