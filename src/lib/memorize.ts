import { variantGroups } from '../data/variants'

const PUNCTUATION = /[，。；：！？、“”‘’《》（）〈〉·…—\s,.!?;:'"()[\]]/g

const VARIANT_CANONICAL = new Map<string, string>()
variantGroups.forEach((group) => {
  group.forEach((char) => VARIANT_CANONICAL.set(char, group[0]))
})

/** 把同字异体映射为章文用字，比对时按等价字处理；表外的字原样返回 */
function canonicalChar(char: string): string {
  return VARIANT_CANONICAL.get(char) ?? char
}

/** 去掉标点与空白，保留汉字与字母数字 */
export function normalize(text: string): string {
  return text.replace(PUNCTUATION, '')
}

export type DiffType = 'same' | 'missing' | 'extra'

export interface DiffOp {
  type: DiffType
  char: string
}

export interface DiffMark {
  char: string
  ok: boolean
  /** 标点只作分隔，不参与判定 */
  punctuation?: boolean
}

export interface Substitution {
  /** 默写里写的字 */
  input: string
  /** 原文里的字 */
  expected: string
  /** 该字在 marks（去掉标点后的原文顺序）中的下标 */
  index: number
}

export interface DiffResult {
  ops: DiffOp[]
  /** 与原文一致的字数，同字异体按一致计算 */
  correct: number
  /** 原文中漏写的字数，不含同位写错 */
  missing: number
  /** 多写的字数，不含同位写错 */
  extra: number
  /** 同位写错的字数：字写错了，位置对得上 */
  wrong: number
  /** 同位写错的明细，按原文顺序 */
  substitutions: Substitution[]
  /** 原文总字数 */
  total: number
  /** 0 到 100 的完成度，多写与写错都会拉低分数 */
  score: number
  /** 一字不差：没有漏写、写错和多写 */
  perfect: boolean
  /** 按原文顺序标出对错，漏写处保留原字 */
  marks: DiffMark[]
  /** 按段落组织的对照结果，保留原文标点 */
  lines: DiffMark[][]
  extraText: string
}

const PUNCTUATION_CHAR = /[，。；：！？、“”‘’《》（）〈〉·…—\s,.!?;:'"()]/

function isPunctuationChar(char: string): boolean {
  return PUNCTUATION_CHAR.test(char)
}

/**
 * 以最长公共子序列对齐原文与默写内容。
 * 对齐后可以指出哪些字写对、哪些字漏掉、哪些字多写、哪些位置写了别的字。
 * 同字异体按原文用字比较，不算写错。
 */
export function diffText(target: string, input: string): DiffResult {
  const a = Array.from(normalize(target))
  const b = Array.from(normalize(input))
  const comparableA = a.map(canonicalChar)
  const comparableB = b.map(canonicalChar)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = comparableA[i] === comparableB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (comparableA[i] === comparableB[j]) {
      ops.push({ type: 'same', char: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'missing', char: a[i] })
      i += 1
    } else {
      ops.push({ type: 'extra', char: b[j] })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'missing', char: a[i] })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'extra', char: b[j] })
    j += 1
  }

  // 两处相同文字之间若漏写与多写的字数相等，按顺序一一配对，还原成同位写错，
  // 避免把写错的字报成「多写的字」。字数不等时对齐本身就有歧义，仍按漏写、多写分开计。
  const substitutions: Substitution[] = []
  const pairedMissing = new Set<number>()
  const pairedExtra = new Set<number>()
  // marks 去掉了多写的字，同一下标要按「前面有几个非多写字」换算
  const markIndexBefore: number[] = []
  let markCount = 0
  ops.forEach((op) => {
    markIndexBefore.push(markCount)
    if (op.type !== 'extra') markCount += 1
  })
  let runMissing: number[] = []
  let runExtra: number[] = []
  const flushRun = () => {
    if (runMissing.length === runExtra.length) {
      runMissing.forEach((missingIndex, position) => {
        const extraIndex = runExtra[position]
        pairedMissing.add(missingIndex)
        pairedExtra.add(extraIndex)
        substitutions.push({
          input: ops[extraIndex].char,
          expected: ops[missingIndex].char,
          index: markIndexBefore[missingIndex],
        })
      })
    }
    runMissing = []
    runExtra = []
  }
  ops.forEach((op, index) => {
    if (op.type === 'missing') runMissing.push(index)
    else if (op.type === 'extra') runExtra.push(index)
    else flushRun()
  })
  flushRun()

  const correct = ops.filter((op) => op.type === 'same').length
  const wrong = substitutions.length
  const missing = ops.filter((op, index) => op.type === 'missing' && !pairedMissing.has(index)).length
  const extra = ops.filter((op, index) => op.type === 'extra' && !pairedExtra.has(index)).length

  const marks: DiffMark[] = ops
    .filter((op) => op.type !== 'extra')
    .map((op) => ({ char: op.char, ok: op.type === 'same' }))

  // 按原文重新走一遍，把标点补回对照结果，并按句分行
  const aligned = ops.filter((op) => op.type !== 'extra')
  const rawParagraphs = target.match(/[^。！？]+[。！？]?/g) ?? [target]
  let cursor = 0
  const lines: DiffMark[][] = rawParagraphs.map((paragraph) => {
    const line: DiffMark[] = []
    Array.from(paragraph).forEach((char) => {
      if (isPunctuationChar(char)) {
        line.push({ char, ok: true, punctuation: true })
        return
      }
      const op = aligned[cursor]
      cursor += 1
      line.push({ char, ok: op ? op.type === 'same' : false })
    })
    return line
  })

  return {
    ops,
    correct,
    missing,
    extra,
    wrong,
    substitutions,
    total: n,
    score: n === 0 ? 0 : Math.round((correct / Math.max(n, correct + wrong + extra)) * 100),
    perfect: missing === 0 && wrong === 0 && extra === 0,
    marks,
    lines,
    extraText: ops
      .filter((op, index) => op.type === 'extra' && !pairedExtra.has(index))
      .map((op) => op.char)
      .join(''),
  }
}

/** 供逐句提示使用：只露首字和字数 */
export function hintForClause(clause: string): { first: string; length: number } {
  const chars = Array.from(normalize(clause))
  return { first: chars[0] ?? '', length: chars.length }
}

/**
 * 把原文切成便于回想的片段：先按句号切，过长的句子再按逗号切成 6 到 16 字的小段。
 * 太短会失去上下文，太长又难以一口气想起。
 */
export function splitClauses(paragraphs: string[]): string[] {
  const sentences = paragraphs
    .flatMap((paragraph) => paragraph.split(/(?<=[。！？])/))
    .map((clause) => clause.trim())
    .filter(Boolean)

  const result: string[] = []
  sentences.forEach((sentence) => {
    if (Array.from(normalize(sentence)).length <= 16) {
      result.push(sentence)
      return
    }
    const pieces = sentence
      .split(/(?<=[，；：])/)
      .map((piece) => piece.trim())
      .filter(Boolean)
    let buffer = ''
    pieces.forEach((piece) => {
      const merged = buffer + piece
      if (buffer && Array.from(normalize(merged)).length > 16) {
        result.push(buffer)
        buffer = piece
      } else {
        buffer = merged
      }
    })
    if (buffer) result.push(buffer)
  })
  return result
}

/** 每句的首字，用于复习页提示 */
export function firstCharsOf(paragraphs: string[]): string[][] {
  return paragraphs.map((paragraph) =>
    paragraph
      .split(/(?<=[。！？])/)
      .map((clause) => clause.trim())
      .filter(Boolean)
      .map((clause) => normalize(clause)[0] ?? ''),
  )
}

export interface BlankChar {
  char: string
  blankId?: number
}

export interface Blank {
  id: number
  answer: string
}

export interface BlankExercise {
  chars: BlankChar[]
  blanks: Blank[]
}

function isPunctuation(char: string): boolean {
  return /[，。；：！？、“”‘’《》（）〈〉·…—\s]/.test(char)
}

/** 简单可复现的伪随机数，保证同一种子生成同一组空格 */
export function createRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 从原文中挖空。种子相同则挖空位置相同，方便重做与测试。
 * 短章至少 3 空，长章最多 10 空。
 */
export function buildBlankExercise(paragraphs: string[], seed = 1): BlankExercise {
  const text = paragraphs.join('')
  const chars = Array.from(text)
  const candidates: number[] = []
  chars.forEach((char, index) => {
    if (!isPunctuation(char)) candidates.push(index)
  })

  const desired = Math.min(10, Math.max(3, Math.round(candidates.length * 0.18)))
  const random = createRandom(seed)
  const picked = new Set<number>()
  while (picked.size < Math.min(desired, candidates.length)) {
    const index = candidates[Math.floor(random() * candidates.length)]
    picked.add(index)
  }

  const blanks: Blank[] = []
  const blankIdByIndex = new Map<number, number>()
  picked.forEach((index) => {
    const id = blanks.length
    blankIdByIndex.set(index, id)
    blanks.push({ id, answer: chars[index] })
  })

  const items: BlankChar[] = chars.map((char, index) => ({
    char,
    blankId: blankIdByIndex.get(index),
  }))

  return { chars: items, blanks }
}

export interface BlankResult {
  id: number
  answer: string
  input: string
  correct: boolean
}

export interface BlankEvaluation {
  results: BlankResult[]
  correct: number
  total: number
  score: number
}

export function evaluateBlanks(blanks: Blank[], answers: Record<number, string>): BlankEvaluation {
  const results = blanks.map((blank) => {
    const input = normalize(answers[blank.id] ?? '')
    return { id: blank.id, answer: blank.answer, input, correct: input === blank.answer }
  })
  const correct = results.filter((result) => result.correct).length
  return {
    results,
    correct,
    total: blanks.length,
    score: blanks.length === 0 ? 0 : Math.round((correct / blanks.length) * 100),
  }
}

/**
 * 默写评分对应的提示语。
 * perfect 表示没有漏写、写错与多写；分数会四舍五入，只看分数会把个别错字说成「一字不差」。
 */
export function scoreComment(score: number, perfect = false): string {
  if (perfect && score >= 98) return '一字不差，可以进入长间隔复习了。'
  if (score >= 85) return '很稳，只有零星几处需要再看一眼。'
  if (score >= 65) return '大框架记得，个别字句还要补一补。'
  if (score >= 40) return '有印象，但还不够熟，建议先看提示再默写。'
  return '先回到原文读两遍，再逐句过一遍。'
}
