import type { ChapterGloss, CharGloss } from '../data/glosses/types'

/**
 * 变调规则。
 *
 * 注音数据里存的是本调（「不」一律标 bù，「一」一律标 yī），这是字典的规范写法。
 * 但实际朗读时「不」「一」会变调，课本给篇章注音时也按变调标：
 * - 不 + 四声 → bú（则无不治 bú zhì）
 * - 一 + 四声 → yí，一 + 一二三声 → yì
 *
 * 存储本调、展示与朗读时按上下文推导，好处是数据只有一份真相，
 * 规则改动不必回头改 5283 个条目。
 */

/** 带调元音到本调元音、调号的映射 */
const VOWEL_TONES: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

const TONE_OF_MARK = new Map<string, { vowel: string; tone: number }>()
Object.entries(VOWEL_TONES).forEach(([vowel, marks]) => {
  marks.forEach((mark, index) => TONE_OF_MARK.set(mark, { vowel, tone: index + 1 }))
})

/** 取拼音的调号，1 至 4 为四声，5 为轻声，无拼音返回 undefined */
export function toneOf(pinyin?: string): number | undefined {
  if (!pinyin) return undefined
  for (const char of pinyin) {
    const mark = TONE_OF_MARK.get(char)
    if (mark) return mark.tone
  }
  return 5
}

/** 把拼音改成指定调号，用于「不」「一」的变调 */
export function changeTone(pinyin: string, tone: number): string {
  for (const char of pinyin) {
    const mark = TONE_OF_MARK.get(char)
    if (!mark) continue
    const marks = VOWEL_TONES[mark.vowel]
    if (!marks || tone < 1 || tone > 4) return pinyin
    return pinyin.replace(char, marks[tone - 1])
  }
  return pinyin
}

/** 下一个能读的字；标点会截断变调，所以标点不算后继 */
function nextToken(line: CharGloss[], index: number): CharGloss | undefined {
  const next = line[index + 1]
  return next?.pinyin ? next : undefined
}

/**
 * 「一」什么时候读变调：只有它作数词修饰名词、量词时才变调，
 * 如「共一毂」读 yì gǔ。作名词的「一」（道生一、抱一、得一以清）是
 * 「道之一」，仍读 yī，不能按规则机械变调。
 */
function isNumeralBeforeNoun(next: CharGloss): boolean {
  return /^(名词|量词)/.test(next.gloss ?? '')
}

/** 单字的变调结果，未变调返回 undefined */
export function sandhiOf(line: CharGloss[], index: number): string | undefined {
  const token = line[index]
  const next = nextToken(line, index)
  if (!next) return undefined
  const nextTone = toneOf(next.pinyin)
  if (!nextTone) return undefined

  if (token.char === '不' && token.pinyin === 'bù') {
    return nextTone === 4 ? 'bú' : undefined
  }
  if (token.char === '一' && token.pinyin === 'yī' && isNumeralBeforeNoun(next)) {
    return nextTone === 4 ? 'yí' : 'yì'
  }
  return undefined
}

/** 整章按变调规则重算「不」「一」的读音，变调处补一条提示 */
export function applyToneSandhi(gloss: ChapterGloss): ChapterGloss {
  return gloss.map((line) =>
    line.map((token, index) => {
      const adjusted = sandhiOf(line, index)
      if (!adjusted) return token
      return { ...token, pinyin: adjusted, hint: token.hint ?? '变调' }
    }),
  )
}

/** 统计一章里有多少处变调，供测试与展示使用 */
export function countSandhi(gloss: ChapterGloss): number {
  return gloss.reduce((total, line) => total + line.filter((_, index) => sandhiOf(line, index)).length, 0)
}
