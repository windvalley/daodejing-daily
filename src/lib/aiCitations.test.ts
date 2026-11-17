import { describe, expect, it } from 'vitest'
import {
  chineseChapterNumber,
  checkCitations,
  citationNotice,
  claimedChapterOf,
  extractChapterRefs,
  extractQuotes,
  findQuoteChapter,
  quoteInChapter,
  unknownChapterRefs,
} from './aiCitations'

describe('章号识别', () => {
  it('阿拉伯数字与中文数字都能认', () => {
    expect(chineseChapterNumber('1')).toBe(1)
    expect(chineseChapterNumber('81')).toBe(81)
    expect(chineseChapterNumber('十')).toBe(10)
    expect(chineseChapterNumber('十一')).toBe(11)
    expect(chineseChapterNumber('二十')).toBe(20)
    expect(chineseChapterNumber('八十一')).toBe(81)
    expect(chineseChapterNumber('abc')).toBeNull()
    expect(chineseChapterNumber('')).toBeNull()
  })

  it('回答里的章号去重并按出现顺序排列，超出八十一章的丢掉', () => {
    expect(extractChapterRefs('第8章讲水，第 1 章讲道，第8章再说一次。')).toEqual([8, 1])
    expect(extractChapterRefs('第六十四章说「千里之行」')).toEqual([64])
    expect(extractChapterRefs('第九十九章不存在')).toEqual([])
    expect(extractChapterRefs('没有章号')).toEqual([])
  })

  it('能指出书里没有的章号', () => {
    expect(unknownChapterRefs('见第82章与第3章')).toEqual([82])
    expect(unknownChapterRefs('见第3章')).toEqual([])
  })
})

describe('引文抽取', () => {
  it('三种引号都能抽，重复的只留一次', () => {
    expect(extractQuotes('他说「上善若水」，又说“道法自然”，再提一遍「上善若水”。')).toEqual(['上善若水', '道法自然'])
  })

  it('没有引号时返回空数组', () => {
    expect(extractQuotes('这一章讲的是柔弱胜刚强。')).toEqual([])
  })
})

describe('引文校验', () => {
  it('真实章句能回溯到对应章', () => {
    expect(findQuoteChapter('上善若水，水善利万物而不争')).toBe(8)
    expect(findQuoteChapter('道可道，非常道')).toBe(1)
    // 标点不同不影响判定，比对前统一去掉
    expect(findQuoteChapter('道可道非常道')).toBe(1)
  })

  it('编造的章句判为对不上', () => {
    expect(findQuoteChapter('道法自然，无为而成')).toBeNull()
    expect(findQuoteChapter('圣人不积，故能成其大')).toBeNull()
  })

  it('带真实引文与编造引文的回答能得到准确计数', () => {
    const report = checkCitations('第八章说「上善若水，水善利万物而不争」，第四十二章又说「道法自然，无为而成」。')
    expect(report.chapters).toEqual([8, 42])
    expect(report.quotes).toHaveLength(2)
    expect(report.quotes[0]).toMatchObject({ chapter: 8, verified: true })
    expect(report.quotes[1]).toMatchObject({ chapter: null, verified: false })
    expect(report.unverified).toBe(1)
  })

  it('太短的术语不参与判定，避免把「无为」判成编造', () => {
    const report = checkCitations('这里的「无为」不是什么都不做。')
    expect(report.quotes).toEqual([])
    expect(report.unverified).toBe(0)
  })

  it('只有章号没有引文时不报未核实', () => {
    const report = checkCitations('可以对照第 8 章与第 78 章。')
    expect(report.chapters).toEqual([8, 78])
    expect(report.unverified).toBe(0)
  })
})

describe('提示文案', () => {
  it('全部核实通过时不打扰读者', () => {
    expect(citationNotice(checkCitations('第八章说「上善若水，水善利万物而不争」。'))).toBeNull()
    expect(citationNotice(checkCitations('这一章讲柔弱。'))).toBeNull()
  })

  it('有对不上的引文时给出可数提示', () => {
    expect(citationNotice(checkCitations('他说「道法自然，无为而成」。'))).toBe(
      '有 1 处引文未在原文中找到，请以章页原文为准。',
    )
  })
})

describe('章号与引文的对应', () => {
  it('句子在书里但章号写错，判为出处错误', () => {
    const report = checkCitations('第四十二章说「上善若水，水善利万物而不争」。')
    expect(report.quotes[0]).toMatchObject({ chapter: 8, claimed: 42, verified: true, misattributed: true })
    expect(report.misattributed).toBe(1)
    expect(citationNotice(report)).toBe('有 1 处引文的章号对不上，请以章页原文为准。')
  })

  it('章号与引文一致时不误报', () => {
    const report = checkCitations('第八章说「上善若水，水善利万物而不争」。')
    expect(report.quotes[0]).toMatchObject({ chapter: 8, claimed: 8, misattributed: false })
    expect(report.misattributed).toBe(0)
    expect(citationNotice(report)).toBeNull()
  })

  it('没点名的引文不判出处，只判是否存在', () => {
    const report = checkCitations('「上善若水，水善利万物而不争」这句话很关键。')
    expect(report.quotes[0]).toMatchObject({ chapter: 8, claimed: null, misattributed: false })
    expect(citationNotice(report)).toBeNull()
  })

  it('跨句点名的章号不算这句的出处，避免误判', () => {
    const report = checkCitations('第四十二章讲万物生成。「上善若水，水善利万物而不争」另说一层。')
    expect(report.quotes[0].claimed).toBeNull()
    expect(report.misattributed).toBe(0)
  })

  it('一句里两处引文各归各的章号', () => {
    const report = checkCitations('第八章说「上善若水，水善利万物而不争」，又说「夫唯不争，故无尤」。')
    expect(report.quotes.map((quote) => quote.claimed)).toEqual([8, 8])
    expect(report.misattributed).toBe(0)
  })

  it('引用写错章又找不到原文时，只报找不到，不重复计数', () => {
    const report = checkCitations('第四十二章说「道法自然，无为而成」。')
    expect(report.quotes[0]).toMatchObject({ verified: false, misattributed: false })
    expect(report.unverified).toBe(1)
    expect(report.misattributed).toBe(0)
    expect(citationNotice(report)).toBe('有 1 处引文未在原文中找到，请以章页原文为准。')
  })
})

describe('标称章号定位', () => {
  it('同一句里点名的章号会被认出来', () => {
    const answer = '第八章说「上善若水」。'
    const index = answer.indexOf('「')
    expect(claimedChapterOf(answer, index)).toBe(8)
  })

  it('隔着句子结束符就不算', () => {
    const answer = '第八章讲水。然后「上善若水」出现在别处。'
    expect(claimedChapterOf(answer, answer.indexOf('「'))).toBeNull()
  })

  it('引文前没有章号时返回 null', () => {
    expect(claimedChapterOf('「上善若水」很关键。', 0)).toBeNull()
  })
})

describe('引文归属单章', () => {
  it('能判断某句是否出自某一章', () => {
    expect(quoteInChapter('上善若水，水善利万物而不争', 8)).toBe(true)
    expect(quoteInChapter('上善若水，水善利万物而不争', 42)).toBe(false)
    expect(quoteInChapter('不存在的句子', 8)).toBe(false)
  })
})
