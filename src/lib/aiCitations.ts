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
  /** 引文实际所在的章，对不上任何一章时为 null */
  chapter: number | null
  /** 回答给这句标称的章号；没在引文前点名某章时为 null */
  claimed: number | null
  /** 在原文里找得到 */
  verified: boolean
  /** 找得到，但不在回答说的那一章 */
  misattributed: boolean
}

export interface CitationReport {
  /** 回答里点到的章号，去重并按出现顺序排列，只保留书中存在的章 */
  chapters: number[]
  /** 引号里的片段及其核实结果 */
  quotes: CitationQuote[]
  /** 对不上原文的引用条数 */
  unverified: number
  /** 出处写错的条数：句子在书里，但不在回答说的那一章 */
  misattributed: number
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

export interface RawQuote {
  text: string
  /** 引文在回答里的起始位置，用来找它前面点名的是哪一章 */
  index: number
}

/** 抽取引号里的片段。同一句用不同引号重复出现只留第一次 */
export function extractQuoteSpans(answer: string): RawQuote[] {
  const found: RawQuote[] = []
  QUOTE_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0
    let match = pattern.exec(answer)
    while (match) {
      const quote = match[1].trim()
      if (quote && !found.some((item) => item.text === quote)) found.push({ text: quote, index: match.index })
      match = pattern.exec(answer)
    }
  })
  return found.sort((a, b) => a.index - b.index)
}

/** 只要文本，测试与界面提示用 */
export function extractQuotes(answer: string): string[] {
  return extractQuoteSpans(answer).map((quote) => quote.text)
}

const SENTENCE_BREAK = /[。！？；\n]/

/**
 * 引文前面最近一次点名的是哪一章。
 *
 * 只在同一句里找：跨句去猜会让「第四十二章讲道生一。这一点和「上善若水」相通」这类写法误判。
 * 找不到明确的标称就返回 null，不硬套。
 */
export function claimedChapterOf(answer: string, quoteIndex: number): number | null {
  const before = answer.slice(0, quoteIndex)
  const match = /第\s*(\d{1,2}|[一二三四五六七八九十]+)\s*章/g
  let claimed: number | null = null
  let found = match.exec(before)
  while (found) {
    const gap = before.slice(found.index + found[0].length)
    // 标称与引文之间隔了句号问号，说明这句引文不归那句话管
    if (!SENTENCE_BREAK.test(gap)) {
      const number = chineseChapterNumber(found[1])
      if (number && number >= 1 && number <= chapters.length) claimed = number
    }
    found = match.exec(before)
  }
  return claimed
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
let normalizedMaterials: Map<number, string> | null = null

const textIndex = (): Map<number, string> => {
  normalizedTexts ??= new Map(chapters.map((chapter) => [chapter.number, normalize(chapter.text.join(''))]))
  return normalizedTexts
}

/**
 * 一章的全部材料：原文之外还有译文、章旨、注释与实践提示。
 *
 * 只查原文会误报。真实模型回答「上善」时引了注释里的「最高的善」，那是书里的话，
 * 却不在原文里；读者看到「未在原文中找到」只会觉得这个提示是坏的。
 */
const materialIndex = (): Map<number, string> => {
  if (normalizedMaterials === null) {
    normalizedMaterials = new Map(
      chapters.map((chapter) => [
        chapter.number,
        normalize(
          [
            chapter.text.join(''),
            chapter.gist,
            chapter.translation,
            chapter.practice,
            ...chapter.notes.map((note) => `${note.term}${note.text}`),
          ].join(''),
        ),
      ]),
    )
  }
  return normalizedMaterials
}

/**
 * 引文按标点切成若干片段。
 *
 * 模型常把同一章隔着几句的两截并进一个引号，如第 81 章「利而不害，为而不争」，
 * 原文中间还隔着「圣人之道」。整串去重后不是连续子串，但每一截都在这一章里，
 * 这是省略式引用，不该判成编造。
 */
function fragmentsOf(quote: string): string[] {
  return quote
    .split(/[，。；：、！？,.!?;:\s]+/)
    .map((fragment) => normalize(fragment))
    .filter(Boolean)
}

function containsAll(text: string | undefined, fragments: string[]): boolean {
  if (!text || !fragments.length) return false
  return fragments.every((fragment) => text.includes(fragment))
}

/** 逐章查找引文，返回第一个包含它的章号 */
export function findQuoteChapter(quote: string): number | null {
  const plain = normalize(quote)
  if (!plain) return null
  const fragments = fragmentsOf(quote)
  // 先按原文整串找，能找到就是最干净的情况
  for (const [number, text] of textIndex()) {
    if (text.includes(plain)) return number
  }
  // 再按原文的片段找，处理省略式引用
  for (const [number, text] of textIndex()) {
    if (fragments.length > 1 && containsAll(text, fragments)) return number
  }
  // 最后放宽到整章材料，注释与译文也算书里的话
  for (const [number, text] of materialIndex()) {
    if (text.includes(plain)) return number
  }
  for (const [number, text] of materialIndex()) {
    if (fragments.length > 1 && containsAll(text, fragments)) return number
  }
  return null
}

/** 引文是否出自某一章 */
export function quoteInChapter(quote: string, chapter: number): boolean {
  const fragments = fragmentsOf(quote)
  return containsAll(textIndex().get(chapter), fragments) || containsAll(materialIndex().get(chapter), fragments)
}

/**
 * 校验一条回答。
 * 章号只保留书中真实存在的，引号片段逐条回溯原文，对不上的计入 unverified。
 */
export function checkCitations(answer: string): CitationReport {
  const chaptersInAnswer = extractChapterRefs(answer)
  const quotes: CitationQuote[] = []
  extractQuoteSpans(answer).forEach((quote) => {
    if (!isCheckable(quote.text)) return
    const chapter = findQuoteChapter(quote.text)
    const claimed = claimedChapterOf(answer, quote.index)
    quotes.push({
      text: quote.text,
      chapter,
      claimed,
      verified: chapter !== null,
      // 只在校验通过、且回答明确说了出处、且说的不是同一章时才算写错
      misattributed: chapter !== null && claimed !== null && claimed !== chapter,
    })
  })
  return {
    chapters: chaptersInAnswer,
    quotes,
    unverified: quotes.filter((quote) => !quote.verified).length,
    misattributed: quotes.filter((quote) => quote.misattributed).length,
  }
}

/**
 * 界面提示文案。出处写错比找不到更值得说，所以优先报它。
 * 引用全部对得上时返回 null，不打扰读者。
 */
export function citationNotice(report: CitationReport): string | null {
  if (report.misattributed > 0) {
    return `有 ${report.misattributed} 处引文的章号对不上，请以章页原文为准。`
  }
  if (report.unverified > 0) {
    return `有 ${report.unverified} 处引文未在书中找到，请以章页原文为准。`
  }
  return null
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
