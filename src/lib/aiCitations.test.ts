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
    expect(report.quotes[0]).toMatchObject({ chapters: [8], verified: true })
    expect(report.quotes[1]).toMatchObject({ chapters: [], verified: false })
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
      '「道法自然，无为而成」未在书中找到，请以章页原文为准。',
    )
  })
})

describe('章号与引文的对应', () => {
  it('句子在书里但章号写错，判为出处错误', () => {
    const report = checkCitations('第四十二章说「上善若水，水善利万物而不争」。')
    expect(report.quotes[0]).toMatchObject({ chapters: [8], claimed: 42, verified: true, misattributed: true })
    expect(report.misattributed).toBe(1)
    expect(citationNotice(report)).toBe('「上善若水，水善利万物而不争」实际出自第8章，回答里标成了第42章。')
  })

  it('章号与引文一致时不误报', () => {
    const report = checkCitations('第八章说「上善若水，水善利万物而不争」。')
    expect(report.quotes[0]).toMatchObject({ chapters: [8], claimed: 8, misattributed: false })
    expect(report.misattributed).toBe(0)
    expect(citationNotice(report)).toBeNull()
  })

  it('没点名的引文不判出处，只判是否存在', () => {
    const report = checkCitations('「上善若水，水善利万物而不争」这句话很关键。')
    expect(report.quotes[0]).toMatchObject({ chapters: [8], claimed: null, misattributed: false })
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
    expect(citationNotice(report)).toBe('「道法自然，无为而成」未在书中找到，请以章页原文为准。')
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

describe('真实回答里出现过的两种引法', () => {
  it('引注释里的话不算编造', () => {
    // 第 8 章注释「上善」训作「最高的善」，模型引用它是书里的话
    const report = checkCitations('第8章注释把「上善」训为「最高的善」。')
    expect(report.quotes.find((quote) => quote.text === '最高的善')).toMatchObject({ chapters: [8], verified: true })
    expect(report.unverified).toBe(0)
    expect(citationNotice(report)).toBeNull()
  })

  it('省略中间几句的合并引文不算编造', () => {
    // 第 81 章原文是「天之道，利而不害；圣人之道，为而不争」，中间还隔着「圣人之道」
    const report = checkCitations('第81章「利而不害，为而不争」讲的就是不争。')
    expect(report.quotes[0]).toMatchObject({ chapters: [81], verified: true, misattributed: false })
    expect(report.unverified).toBe(0)
  })

  it('把两章的句子并进一个引号仍然判为找不到', () => {
    const report = checkCitations('「上善若水，道法自然」。')
    expect(report.quotes[0].verified).toBe(false)
    expect(report.unverified).toBe(1)
  })
})

describe('章号放在引文后面', () => {
  it('「X」出自第 N 章 这种写法要认', () => {
    const answer = '「上善若水，水善利万物而不争」出自第8章。'
    const report = checkCitations(answer)
    expect(report.quotes[0]).toMatchObject({ chapters: [8], claimed: 8, misattributed: false })
    expect(citationNotice(report)).toBeNull()
  })

  it('「X」见第 N 章 与「X」在第 N 章 也要认', () => {
    for (const connector of ['见', '在', '见于', '语出']) {
      const answer = `「上善若水，水善利万物而不争」${connector}第8章。`
      expect(checkCitations(answer).quotes[0].claimed).toBe(8)
    }
  })

  it('同一个引号里并排出现的两处出处不互相串', () => {
    // 这是真实模型给出的回答，修之前「不为而成」被当成第 25 章
    const answer = '「道法自然」出自第25章，「不为而成」出自第47章，第42章讲的是「道生一，一生二，二生三，三生万物」。'
    const report = checkCitations(answer)
    const byText = new Map(report.quotes.map((quote) => [quote.text, quote]))
    expect(byText.get('道法自然')).toMatchObject({ chapters: [25], claimed: 25 })
    expect(byText.get('不为成')).toBeUndefined()
    expect(byText.get('不为而成')).toMatchObject({ chapters: [47], claimed: 47, misattributed: false })
    expect(report.misattributed).toBe(0)
  })

  it('后置只隔着标点时不当成出处，那是另起一处话', () => {
    // 「上善若水」后面只是逗号加一句新的话，不是「出自第42章」的出处声明
    const answer = '「上善若水」，第42章讲的是另一回事。'
    expect(checkCitations(answer).quotes.find((quote) => quote.text === '上善若水')?.claimed).toBeNull()
    expect(checkCitations(answer).misattributed).toBe(0)
  })

  it('后置章号写错时照样报，不能因为改了查找方向就放过', () => {
    const answer = '「上善若水，水善利万物而不争」出自第42章。'
    const report = checkCitations(answer)
    expect(report.quotes[0]).toMatchObject({ chapters: [8], claimed: 42, misattributed: true })
    expect(citationNotice(report)).toBe('「上善若水，水善利万物而不争」实际出自第8章，回答里标成了第42章。')
  })

  it('前后都有章号时以后面紧跟的为准', () => {
    const answer = '第1章先说过，「上善若水，水善利万物而不争」出自第8章。'
    expect(checkCitations(answer).quotes[0]).toMatchObject({ chapters: [8], claimed: 8, misattributed: false })
  })
})

describe('真机测试暴露的两类误报', () => {
  it('同一句话在多章出现时，说的其中任意一章都不算错', () => {
    // 「和光同尘」在第 4 章与第 56 章的注释里都出现，真机回答引第 56 章被判成写错
    const report = checkCitations('第56章亦列「和光同尘」为「玄同」的一项。')
    const quote = report.quotes.find((item) => item.text === '和光同尘')
    expect(quote?.chapters).toEqual(expect.arrayContaining([4, 56]))
    expect(quote?.misattributed).toBe(false)
    expect(report.misattributed).toBe(0)
    expect(citationNotice(report)).toBeNull()
  })

  it('多章命中时，说的章根本不在其中仍然要报', () => {
    const report = checkCitations('第42章说「和光同尘」。')
    expect(report.quotes[0].chapters).toEqual(expect.arrayContaining([4, 56]))
    expect(report.misattributed).toBe(1)
    expect(citationNotice(report)).toBe('「和光同尘」实际出自第4章，回答里标成了第42章。')
  })

  it('「X 是第 N 章 Y 的意思」讲的是释义关系，不当作出处声明', () => {
    // 「适可而止」在第三十二章译文里出现，真机回答用它解释第 9 章，被判成章号写错
    const answer = '而「适可而止」是第9章「持而盈之，不如其已」和第32章「知止」的意思。'
    const report = checkCitations(answer)
    const quote = report.quotes.find((item) => item.text === '适可而止')
    expect(quote?.claimed).toBeNull()
    expect(quote?.misattributed).toBe(false)
    expect(report.misattributed).toBe(0)
  })

  it('转述打了引号会被点名，读者一眼能认出那是转述', () => {
    const report = checkCitations('第二条「给日程留白」其实出自第11章。')
    expect(citationNotice(report)).toBe('「给日程留白」未在书中找到，请以章页原文为准。')
  })

  it('多处找不到时最多点名两句，不把提示写成一长串', () => {
    const report = checkCitations('「甲乙丙丁戊」与「己庚辛壬癸」这两句都不在书里。')
    expect(report.unverified).toBe(2)
    const notice = citationNotice(report) ?? ''
    expect(notice).toContain('等 2 处引文未在书中找到')
    expect(notice.length).toBeLessThan(80)
  })
})
