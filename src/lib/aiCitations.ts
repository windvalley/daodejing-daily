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
  /**
   * 引文实际出现的所有章，按章号升序；找不到时为空数组。
   *
   * 存数组而不是单个章号：「和光同尘」在第 4 章与第 56 章的注释里都有，
   * 只记第一个命中的章，会把读者指向第 56 章的正确说法判成写错。
   */
  chapters: number[]
  /** 回答给这句标称的章号；没有明确出处声明时为 null */
  claimed: number | null
  /** 在书里找得到 */
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
  /** 引文在回答里的起始位置（含开头引号），用来找它前面点名的是哪一章 */
  index: number
  /** 引文结束位置（闭合引号之后），用来找它后面跟的「出自第 N 章」 */
  end: number
}

/** 抽取引号里的片段。同一句用不同引号重复出现只留第一次 */
export function extractQuoteSpans(answer: string): RawQuote[] {
  const found: RawQuote[] = []
  QUOTE_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0
    let match = pattern.exec(answer)
    while (match) {
      const quote = match[1].trim()
      if (quote && !found.some((item) => item.text === quote)) {
        found.push({ text: quote, index: match.index, end: match.index + match[0].length })
      }
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
 * 引文后面跟出处的连接词：出自、语出、见于、出于、载于、见、在。
 *
 * 只认明确的出处声明。两类别扭进来：
 * - 光有标点：「「上善若水」，「第42章又讲……」」是另起一处引文，不是前一句的出处。
 * - 「是」「即」「约」这类系词：「「适可而止」是第9章「持而盈之」的意思」讲的是释义关系，
 *   并不声称这句出自第九章。真实回答里「适可而止」恰好也出现在第三十二章译文里，
 *   认了系词就会把一句准确的话报成章号写错。
 */
const TRAILING_LINK = /^(?:出自于|出自|语出|见于|出于|载于|见|在)[\s：:，,]*$/

const CHAPTER_PATTERN = /第\s*(\d{1,2}|[一二三四五六七八九十]+)\s*章/g

function validChapter(input: string): number | null {
  const number = chineseChapterNumber(input)
  return number && number >= 1 && number <= chapters.length ? number : null
}

/**
 * 引文标称的是哪一章。
 *
 * 先看后置：「『道法自然』出自第25章」。中文里这是最常见的写法，而章号在引文后面，
 * 只往前找就会错配到上一条引文的章号。真实模型的回答里出现过
 * 「『道法自然』出自第25章，『不为而成』出自第47章」，结果前者正确、后者被当成第 25 章。
 *
 * 再看前置：「第8章说『上善若水』」。只在同一句里找：跨句去猜会让
 * 「第四十二章讲道生一。这一点和『上善若水』相通」这类写法误判。
 * 两处都找不到明确的标称就返回 null，不硬套。
 */
export function claimedChapterOf(answer: string, quoteIndex: number, quoteEnd = quoteIndex): number | null {
  const after = answer.slice(quoteEnd)
  const trailing = /^([^。！？；\n]{0,8}?)第\s*(\d{1,2}|[一二三四五六七八九十]+)\s*章/.exec(after)
  if (trailing && TRAILING_LINK.test(trailing[1])) {
    const number = validChapter(trailing[2])
    if (number) return number
  }

  const before = answer.slice(0, quoteIndex)
  let claimed: number | null = null
  CHAPTER_PATTERN.lastIndex = 0
  let found = CHAPTER_PATTERN.exec(before)
  while (found) {
    const gap = before.slice(found.index + found[0].length)
    // 标称与引文之间隔了句号问号，说明这句引文不归那句话管
    if (!SENTENCE_BREAK.test(gap)) {
      const number = validChapter(found[1])
      if (number) claimed = number
    }
    found = CHAPTER_PATTERN.exec(before)
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

/**
 * 引文出现在哪几章。
 *
 * 同一句话可能落在多章，例如「和光同尘」在第 4 章与第 56 章的注释里都出现，
 * 「知止」在第三十二章与第四十四章都有。只认第一个命中的章会把正确的引用判成写错，
 * 所以这里收集全部命中章，由调用方判断回答说的那一章在不在其中。
 */
export function findQuoteChapters(quote: string): number[] {
  const plain = normalize(quote)
  if (!plain) return []
  const fragments = fragmentsOf(quote)

  // 整串命中最干净，命中就直接返回，不再退到片段匹配
  const exact: number[] = []
  for (const [number, text] of textIndex()) {
    if (text.includes(plain)) exact.push(number)
  }
  if (exact.length) return exact

  const byFragments: number[] = []
  if (fragments.length > 1) {
    for (const [number, text] of textIndex()) {
      if (containsAll(text, fragments)) byFragments.push(number)
    }
    if (byFragments.length) return byFragments
  }

  // 最后放宽到整章材料，注释与译文也算书里的话
  for (const [number, text] of materialIndex()) {
    if (text.includes(plain)) exact.push(number)
  }
  if (exact.length) return exact

  for (const [number, text] of materialIndex()) {
    if (fragments.length > 1 && containsAll(text, fragments)) byFragments.push(number)
  }
  return byFragments
}

/** 逐章查找引文，返回第一个包含它的章号；界面提示以外的地方用得上 */
export function findQuoteChapter(quote: string): number | null {
  return findQuoteChapters(quote)[0] ?? null
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
    const found = findQuoteChapters(quote.text)
    const claimed = claimedChapterOf(answer, quote.index, quote.end)
    quotes.push({
      text: quote.text,
      chapters: found,
      claimed,
      verified: found.length > 0,
      // 只有「书里确实有这句、但不在回答说的那一章」才算写错；
      // 这句话可能同时出现在好几章，只要包含回答说的那一章就不算错
      misattributed: found.length > 0 && claimed !== null && !found.includes(claimed),
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
 * 界面提示文案。引用全部对得上时返回 null，不打扰读者。
 *
 * 只有一处写错时直接把「哪一句、实际在哪一章」写出来，读者能立刻核对；
 * 「有 N 处章号对不上」这种笼统提示，在一段长回答里等于没说。
 */
export function citationNotice(report: CitationReport): string | null {
  const notices: string[] = []

  const wrong = report.quotes.filter((quote) => quote.misattributed)
  if (wrong.length === 1) {
    const [quote] = wrong
    notices.push(`「${quote.text}」实际出自第${quote.chapters[0]}章，回答里标成了第${quote.claimed}章。`)
  } else if (wrong.length > 1) {
    notices.push(`有 ${wrong.length} 处引文的章号对不上，请以章页原文为准。`)
  }

  const missing = report.quotes.filter((quote) => !quote.verified)
  if (missing.length === 1) {
    // 点名是哪一句。真实回答里常把转述也打上引号（如「给日程留白」），
    // 只说「有 1 处」读者无从判断，把原话摆出来他一眼就知道那是自己的转述。
    notices.push(`「${missing[0].text}」未在书中找到，请以章页原文为准。`)
  } else if (missing.length > 1) {
    const names = missing
      .slice(0, 2)
      .map((quote) => `「${quote.text}」`)
      .join('')
    notices.push(`${names}等 ${missing.length} 处引文未在书中找到，请以章页原文为准。`)
  }

  return notices.length ? notices.join('') : null
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
