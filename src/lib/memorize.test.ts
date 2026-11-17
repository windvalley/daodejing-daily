import { describe, expect, it } from 'vitest'
import {
  buildBlankExercise,
  createRandom,
  diffText,
  evaluateBlanks,
  firstCharsOf,
  hintForClause,
  normalize,
  scoreComment,
  splitClauses,
} from './memorize'

describe('normalize', () => {
  it('去掉常见中英文标点与空白', () => {
    expect(normalize('道可道，非常道；名可名！')).toBe('道可道非常道名可名')
    expect(normalize(' 上善 若水. ')).toBe('上善若水')
  })
})

describe('diffText', () => {
  const target = '道可道，非常道；名可名，非常名。'

  it('完全一致时得满分', () => {
    const result = diffText(target, '道可道非常道名可名非常名')
    expect(result.missing).toBe(0)
    expect(result.extra).toBe(0)
    expect(result.score).toBe(100)
    expect(result.marks.every((mark) => mark.ok)).toBe(true)
  })

  it('标点差异不影响判定', () => {
    const result = diffText(target, '道可道,非常道.名可名,非常名!')
    expect(result.score).toBe(100)
  })

  it('漏字会标出原文对应位置', () => {
    const result = diffText(target, '道可道非常道名可名')
    expect(result.correct).toBe(9)
    expect(result.missing).toBe(3)
    expect(result.score).toBe(75)
    expect(result.marks.filter((mark) => !mark.ok).map((mark) => mark.char)).toEqual(['非', '常', '名'])
  })

  it('多写的字计入 extra 并拉低得分', () => {
    const result = diffText('上善若水', '上善若水水')
    expect(result.extra).toBe(1)
    expect(result.extraText).toBe('水')
    expect(result.score).toBe(80)
  })

  it('写错字时单列为写错，不算漏写加多写', () => {
    const result = diffText('知人者智', '知人者知')
    expect(result.correct).toBe(3)
    expect(result.wrong).toBe(1)
    expect(result.missing).toBe(0)
    expect(result.extra).toBe(0)
    expect(result.extraText).toBe('')
    expect(result.substitutions).toEqual([{ input: '知', expected: '智', index: 3 }])
    expect(result.perfect).toBe(false)
    expect(result.score).toBe(75)
  })

  it('同字异体按一致处理，不计漏写或多写', () => {
    const chapter5 = '天地之间，其犹橐籥乎？'
    const result = diffText(chapter5, '天地之间，其犹橐龠乎？')
    expect(result.wrong).toBe(0)
    expect(result.missing).toBe(0)
    expect(result.extra).toBe(0)
    expect(result.substitutions).toEqual([])
    expect(result.perfect).toBe(true)
    expect(result.score).toBe(100)
    expect(result.marks.every((mark) => mark.ok)).toBe(true)
  })

  it('漏写与多写不相邻时仍各自计数', () => {
    // 写错的字正好等于紧邻的下一个字，对齐有歧义，按漏写加多写计，行为在此锁定
    const result = diffText('上善若水', '上善水水')
    expect(result.wrong).toBe(0)
    expect(result.missing).toBe(1)
    expect(result.extra).toBe(1)
    expect(result.extraText).toBe('水')
  })

  it('写错字在 marks 里的下标不受前面多写的字影响', () => {
    const result = diffText('不如守中', 'X不如宇中')
    expect(result.extraText).toBe('X')
    expect(result.substitutions).toHaveLength(1)
    expect(result.substitutions[0]).toMatchObject({ input: '宇', expected: '守' })
    const { index } = result.substitutions[0]
    expect(result.marks[index]).toEqual({ char: '守', ok: false })
  })

  it('连续写错多个字时逐字配对，仍按写错计', () => {
    const result = diffText('不如守中', '不如宇宙')
    expect(result.wrong).toBe(2)
    expect(result.missing).toBe(0)
    expect(result.extra).toBe(0)
    expect(result.substitutions).toEqual([
      { input: '宇', expected: '守', index: 2 },
      { input: '宙', expected: '中', index: 3 },
    ])
  })

  it('漏写与多写字数不等时不强行配对，避免把整段换成写错', () => {
    const result = diffText('上善若水', '上善区')
    expect(result.wrong).toBe(0)
    expect(result.substitutions).toEqual([])
    expect(result.missing).toBe(2)
    expect(result.extra).toBe(1)
    expect(result.extraText).toBe('区')
  })

  it('空输入得零分', () => {
    const result = diffText(target, '   ')
    expect(result.score).toBe(0)
    expect(result.missing).toBe(result.total)
    expect(result.perfect).toBe(false)
  })
})

describe('buildBlankExercise', () => {
  const paragraphs = ['道可道，非常道；名可名，非常名。', '无名，天地之始；有名，万物之母。']

  it('相同种子生成相同挖空位置', () => {
    const first = buildBlankExercise(paragraphs, 42)
    const second = buildBlankExercise(paragraphs, 42)
    expect(first.blanks).toEqual(second.blanks)
  })

  it('挖空数量在合理范围，且答案与原文一致', () => {
    const exercise = buildBlankExercise(paragraphs, 7)
    const text = paragraphs.join('')
    const plain = Array.from(text)
    expect(exercise.blanks.length).toBeGreaterThanOrEqual(3)
    expect(exercise.blanks.length).toBeLessThanOrEqual(10)
    exercise.blanks.forEach((blank) => {
      expect(plain.filter((char) => char === blank.answer).length).toBeGreaterThan(0)
    })
    const blankedChars = exercise.chars.filter((item) => item.blankId !== undefined)
    expect(blankedChars).toHaveLength(exercise.blanks.length)
  })

  it('挖空处不落在标点上', () => {
    const exercise = buildBlankExercise(paragraphs, 11)
    exercise.chars.forEach((item) => {
      if (item.blankId === undefined) return
      expect(/[，。；：！？]/.test(item.char)).toBe(false)
    })
  })
})

describe('evaluateBlanks', () => {
  const exercise = buildBlankExercise(['上善若水，水善利万物而不争。'], 3)

  it('全对得 100 分', () => {
    const answers = Object.fromEntries(exercise.blanks.map((blank) => [blank.id, blank.answer]))
    const result = evaluateBlanks(exercise.blanks, answers)
    expect(result.correct).toBe(exercise.blanks.length)
    expect(result.score).toBe(100)
  })

  it('空着算错', () => {
    const result = evaluateBlanks(exercise.blanks, {})
    expect(result.correct).toBe(0)
    expect(result.score).toBe(0)
  })

  it('忽略标点与空格输入', () => {
    const answers = Object.fromEntries(exercise.blanks.map((blank) => [blank.id, `${blank.answer}，`]))
    const result = evaluateBlanks(exercise.blanks, answers)
    expect(result.score).toBe(100)
  })

  it('同字异体按一致处理，与默写的判定口径相同', () => {
    const result = evaluateBlanks([{ id: 0, answer: '籥' }], { 0: '龠' })
    expect(result.correct).toBe(1)
    expect(result.score).toBe(100)
    expect(result.results[0].input).toBe('龠')
  })

  it('表外的字仍按原字判定', () => {
    const result = evaluateBlanks([{ id: 0, answer: '籥' }], { 0: '之' })
    expect(result.correct).toBe(0)
  })
})

describe('辅助函数', () => {
  it('hintForClause 返回首字和字数', () => {
    expect(hintForClause('上善若水，')).toEqual({ first: '上', length: 4 })
  })

  it('splitClauses 按句号切句，过长再按逗号分段', () => {
    expect(splitClauses(['道可道，非常道；名可名。天下皆知美之为美。'])).toEqual([
      '道可道，非常道；名可名。',
      '天下皆知美之为美。',
    ])
    const chunks = splitClauses(['居善地，心善渊，与善仁，言善信，正善治，事善能，动善时。'])
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((chunk) => {
      expect(Array.from(normalize(chunk)).length).toBeLessThanOrEqual(16)
    })
    expect(chunks.join('')).toBe('居善地，心善渊，与善仁，言善信，正善治，事善能，动善时。')
  })

  it('firstCharsOf 每段一句取一个首字', () => {
    expect(firstCharsOf(['上善若水。水善利万物而不争。', '居善地。'])).toEqual([['上', '水'], ['居']])
  })

  it('伪随机数可复现', () => {
    const a = createRandom(9)
    const b = createRandom(9)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('分数点评分档', () => {
    expect(scoreComment(100, true)).toContain('一字不差')
    expect(scoreComment(90)).toContain('很稳')
    expect(scoreComment(70)).toContain('框架')
    expect(scoreComment(50)).toContain('印象')
    expect(scoreComment(10)).toContain('读两遍')
  })

  it('分数四舍五入到 98 分但仍有错字时不说「一字不差」', () => {
    // 45 字的章节错 1 字正好 98 分，只按分数分档会把错字说成一字不差
    const almost = diffText('道'.repeat(45), '道'.repeat(44) + '德')
    expect(almost.score).toBe(98)
    expect(almost.perfect).toBe(false)
    expect(scoreComment(almost.score, almost.perfect)).not.toContain('一字不差')
    expect(scoreComment(almost.score, almost.perfect)).toContain('很稳')
  })
})

describe('diffText 的对照行', () => {
  it('保留原文标点并按句分行', () => {
    const result = diffText('上善若水。水善利万物而不争。', '上善若水水善利万物而不争')
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].map((mark) => mark.char).join('')).toBe('上善若水。')
    expect(result.lines[0][4].punctuation).toBe(true)
    expect(result.lines[0].filter((mark) => !mark.punctuation).every((mark) => mark.ok)).toBe(true)
    expect(result.score).toBe(100)
  })

  it('漏写处按原文位置标红', () => {
    const result = diffText('知人者智，自知者明。', '知人者智，自知者')
    const last = result.lines[0].filter((mark) => !mark.punctuation)
    expect(last[last.length - 1]).toEqual({ char: '明', ok: false })
  })
})
