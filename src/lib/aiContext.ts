/**
 * 消息装配。纯函数，输入章节与提问，输出可直接断言的消息数组。
 *
 * 材料分两层：全书放 system 作为固定前缀，当前章节作为焦点放在末条 user。
 * 全书进前缀是为了跨章提问（概念页里「德」关联二十六章）与命中厂商的上下文缓存；
 * 只发当前章时，模型不会承认自己看不到别的章，它会用训练记忆补一个听起来合理的答案。
 */

import type { Chapter } from '../data/chapters'
import { chapters, getChapter } from '../data/chapters'
import { getConcept, conceptsForChapter } from '../data/concepts'
import { getChapterGloss, type GlossLine } from '../data/glosses'
import { normalize } from './memorize'
import type { ChatMessage } from './ai'

export type AiFocus =
  { kind: 'chapter'; chapter: number; sentence?: string } | { kind: 'concept'; concept: string } | { kind: 'none' }

/** 会话历史最多带六条，再长的对话按最近六条截断，防止前缀越滚越大 */
export const MAX_HISTORY_MESSAGES = 6

/** 提示词的硬约束。单独成常量，测试可以断言这些规则没有被改掉 */
export const AI_RULES = [
  '你是《道德经》学习应用里的助手，读者正在读这本书。',
  '',
  '硬性要求：',
  '1. 材料分级：下面给的全书是材料，【当前位置】标出的是主材料。回答时说明依据哪一章，主材料能答的优先用主材料。',
  '2. 训释分歧照实说：注释里已经写明两读的地方（例如第一章「常无欲，常有欲」），必须并列呈现，不替读者裁决。',
  '3. 读音以材料为准：涉及读音时与材料里的拼音一致，材料的读音提示优先于你的印象。',
  '4. 长度：默认三句以内，纯文本，不要 Markdown 标题、表格与长清单。读者明确要求展开时才放宽。',
  '5. 材料里没有的内容就说没有，不要编造章句、出处与注家。',
  '6. 读者问的是生活里的具体处境时，给一步今天能做的事，不要泛泛而谈。',
].join('\n')

/**
 * 联网开启时追加的规则。
 *
 * 三件事缺一不可：把检索设成缺省动作、划清什么时候算「材料不够」、把书外内容与本书分开。
 *
 * 第一条必须是「默认就该用」而不是「可以使用」。写成许可时，模型看到材料里有点相关就
 * 直接作答：真机上问「为什么是『和其光』不是『藏其光』」，材料只注了「含藏光芒，混同尘世」，
 * 模型答完就停，还主动说「材料只说到这一层」，却不去搜。同一问题改成缺省动作后稳定触发检索。
 *
 * 这个应用的价值在底本与训释，「网上说」一旦与本书混为一谈就失去意义，所以分离要求不能省。
 */
export const AI_WEB_RULES = [
  '7. 你有联网搜索工具，默认就该用：读者问的内容在本书材料里找不到依据，或只能找到一部分时，先搜再答。',
  '8. 不要因为材料里「有点相关」就停下。字义、出处、异文、注家分歧、读音、典故、名物、史实、后世用法，' +
    '只要材料没有直接给出，都算材料不够，先去搜。',
  '9. 联网得到的内容必须与本书分开说明：讲清这是书外说法、来自哪里，不要把它写成本书的训释。',
  '10. 两者冲突时以本书材料为准，并如实指出分歧，不要用网络说法覆盖底本。',
  '11. 检索后仍然没有可靠答案，就说没查到，不要用印象补足。',
].join('\n')

/** 没有联网能力时用的规则，只在没开联网工具时说 */
export const AI_OFFLINE_RULES = [
  '7. 你没有联网与检索能力，拿不到本书之外的信息。读者让你联网搜索时，直接说明做不到，不要假装查过；',
  '   若他确实需要本书以外的说法，说明你可以凭既有知识补充，但要讲清那不是本书内容、也可能过时。',
].join('\n')

function formatChapter(chapter: Chapter): string {
  const lines: string[] = []
  lines.push(`### 第${chapter.number}章 ${chapter.title}（${chapter.section === 'dao' ? '道经' : '德经'}）`)
  lines.push('原文：')
  chapter.text.forEach((line) => lines.push(line))
  lines.push(`章旨：${chapter.gist}`)
  lines.push(`译文：${chapter.translation}`)
  lines.push('注释：')
  chapter.notes.forEach((note) => lines.push(`- ${note.term}：${note.text}`))
  lines.push(`实践提示：${chapter.practice}`)
  return lines.join('\n')
}

let bookPrefixCache: string | null = null

/** 全书材料，约两万三千字。模块级缓存，避免每次请求重新拼字符串 */
export function buildBookMaterial(): string {
  if (bookPrefixCache === null) {
    bookPrefixCache = chapters.map(formatChapter).join('\n\n')
  }
  return bookPrefixCache
}

/**
 * 组装 system。
 *
 * 省流模式下只给规则，一个字都不带书里的内容：材料全由焦点块提供。
 * 早先这里塞过一份八十一章目录，但省流模式的承诺就是「只发当前这一章」，
 * 目录本身又是三千多字符，等于把省下的流量又花回去，界面文案也会变成假话。
 */
export function buildSystemPrompt(options: { economy?: boolean; webSearch?: boolean } = {}): string {
  const rules = [AI_RULES, options.webSearch ? AI_WEB_RULES : AI_OFFLINE_RULES].join('\n')
  if (options.economy) return rules
  return [rules, '【全书】\n' + buildBookMaterial()].join('\n\n')
}

/**
 * 找到选中句所在的那一行注音。
 * 注音与原文逐句对齐，所以先按原文行定位；选中句只是半句时再按位置裁剪，
 * 免得把读者没选的字也送进模型，平白拉长提示词。
 */
export function glossForSentence(chapterNumber: number, sentence: string): GlossLine | null {
  const chapter = getChapter(chapterNumber)
  const gloss = getChapterGloss(chapterNumber)
  if (!chapter || !gloss) return null
  const target = normalize(sentence)
  if (!target) return null
  const index = chapter.text.findIndex((line) => normalize(line).includes(target))
  if (index < 0) return null
  const line = gloss[index]
  if (!line) return null

  const plainLine = normalize(chapter.text[index])
  const start = plainLine.indexOf(target)
  if (start < 0) return line
  const end = start + target.length

  const picked: GlossLine = []
  let cursor = 0
  line.forEach((token) => {
    const plain = normalize(token.char)
    const next = cursor + plain.length
    if (plain) {
      if (cursor >= start && next <= end) picked.push(token)
    } else if (cursor > start && (cursor < end || (cursor === end && end === plainLine.length))) {
      // 选区内部的标点保留，模型看到的句子才读得通顺；
      // 选区末尾正好压到行尾时连句号一起带上，选半句时不带后面的分隔符
      picked.push(token)
    }
    cursor = next
  })
  return picked.length ? picked : line
}

function formatGloss(gloss: GlossLine): string {
  const tokens = gloss
    .filter((token) => token.gloss)
    .map((token) => {
      const parts = [`${token.char} ${token.pinyin ?? ''}`.trim()]
      if (token.gloss) parts.push(token.gloss)
      if (token.hint) parts.push(`（${token.hint}）`)
      return parts.join(' ')
    })
  return tokens.join('；')
}

function formatConceptFocus(slug: string): string {
  const concept = getConcept(slug)
  if (!concept) return ''
  const lines = [`【当前位置】概念：${concept.name}（${concept.subtitle}）`, concept.summary]
  if (concept.quotes.length) {
    lines.push('概念页引用的章句：')
    concept.quotes.forEach((quote) => lines.push(`- 第${quote.chapter}章：${quote.text}`))
  }
  const related = concept.chapters.map((number) => getChapter(number)).filter((item): item is Chapter => Boolean(item))
  // 概念页最多关联二十六章，整章正文塞进去既违背省流承诺，也会把提示词撑到一万四千字符。
  // 省流时只给章号，让模型知道范围，正文由读者自己点进去看。
  lines.push(`相关章节：${related.map((chapter) => `第${chapter.number}章`).join('、')}`)
  return lines.join('\n')
}

function formatChapterFocus(focus: { chapter: number; sentence?: string }, economy: boolean): string {
  const chapter = getChapter(focus.chapter)
  if (!chapter) return ''
  const lines = [`【当前位置】第${chapter.number}章 ${chapter.title}`]
  if (economy) lines.push(formatChapter(chapter))

  const sentence = focus.sentence?.trim()
  if (sentence) {
    lines.push(`【读者选中】${sentence}`)
    const gloss = glossForSentence(focus.chapter, sentence)
    if (gloss) {
      const text = formatGloss(gloss)
      // 选中句可能落在注音缺失的段落上，取不到就略过，不要输出空的注音块
      if (text) lines.push(`【选中句的逐字注音与释义】${text}`)
    }
  }

  const related = conceptsForChapter(chapter.number)
  if (related.length) lines.push(`本章关联概念：${related.map((item) => item.name).join('、')}`)
  return lines.join('\n')
}

/** 焦点块。把「读者停在哪」翻译成模型能读的位置与材料 */
export function formatFocus(focus: AiFocus, economy = false): string {
  if (focus.kind === 'chapter') return formatChapterFocus(focus, economy)
  if (focus.kind === 'concept') return formatConceptFocus(focus.concept)
  return ''
}

/**
 * 组装完整消息。
 * 历史只保留最近 MAX_HISTORY_MESSAGES 条，并剔除空内容，避免把上一轮的失败回复带进去。
 */
export function buildAskMessages(
  question: string,
  focus: AiFocus,
  history: ChatMessage[] = [],
  options: { economy?: boolean; webSearch?: boolean } = {},
): ChatMessage[] {
  const economy = options.economy === true
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ economy, webSearch: options.webSearch === true }) },
  ]

  const recent = history
    .filter((message) => message.role !== 'system' && message.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
  recent.forEach((message) => messages.push({ role: message.role, content: message.content }))

  const focused = formatFocus(focus, economy)
  const asked = question.trim()
  messages.push({
    role: 'user',
    content: focused ? `${focused}\n\n【提问】${asked}` : asked,
  })
  return messages
}

/**
 * 空输入框没人会用，给几个能直接点的种子问题。
 * 全部来自本章已有的注释、概念与实践提示，不调用模型，断网也能出。
 *
 * 排列从读到做：先理解字词，再看这一章与概念的关系，最后落到怎么实践。
 * 最后一条固定为「这一章该怎么实践？」，不引用具体章句：
 * 每章的实践提示都随材料发过去，问题再抄一遍原文既占位又容易截成半句话。
 */
export function seedQuestions(chapterNumber: number): string[] {
  const chapter = getChapter(chapterNumber)
  if (!chapter) return []
  const questions = chapter.notes.slice(0, 2).map((note) => `「${note.term}」该怎样理解？`)
  const concept = conceptsForChapter(chapterNumber)[0]
  questions.push(concept ? `这一章和「${concept.name}」是什么关系？` : `这一章的「${chapter.title}」，怎么落到今天？`)
  questions.push('这一章该怎么实践？')
  return questions.slice(0, 4)
}

/**
 * 还原路径里被编码的片段。
 * 这一段在 render 期间执行，而 decodeURIComponent 遇到损坏的转义（如 %E0%A4%A）会抛 URIError；
 * 全站没有 error boundary，抛出去就是整页白屏，所以必须兜住，解码失败按没有焦点处理。
 */
function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/**
 * 从当前路由推断焦点。
 * 章页与背诵页都算「停在某一章」，概念页带着概念名，其余页面没有焦点。
 * 单独拆成纯函数，路由与提示词之间的映射可以脱离渲染断言。
 */
export function focusFromPath(pathname: string): AiFocus {
  const chapterMatch = /^\/(?:chapters|memorize)\/(\d{1,2})(?:\/|$)/.exec(pathname)
  if (chapterMatch) {
    const number = Number(chapterMatch[1])
    if (getChapter(number)) return { kind: 'chapter', chapter: number }
  }
  const conceptMatch = /^\/concepts\/([^/]+)\/?$/.exec(pathname)
  if (conceptMatch) {
    const slug = safeDecode(conceptMatch[1])
    if (slug && getConcept(slug)) return { kind: 'concept', concept: slug }
  }
  return { kind: 'none' }
}

/**
 * 请求失败时的本地兜底章节。
 *
 * 不能直接用 searchChapters：它按空白切词，而自然语言的提问是一整串，
 * 「上善若水是什么意思」只会被当成一个词，命中不了任何章节。
 * 这里退一步，用提问里的三字窗口去原文里扫，命中次数最多的章节排前面。
 * 只是兜底用的启发式，不追求精确。
 */
export function fallbackChapters(question: string, focus: AiFocus, limit = 3): Chapter[] {
  const plain = normalize(question)
  const hits = new Map<number, number>()
  const windowSize = 3
  for (let start = 0; start + windowSize <= plain.length; start += 1) {
    const window = plain.slice(start, start + windowSize)
    // 问句里的「什么」「怎么」这类词对定位没有帮助，只保留至少两字实词的窗口太复杂，
    // 这里靠命中次数自然稀释：泛词会在很多章出现，实词只在一两章出现。
    chapters.forEach((chapter) => {
      const text = normalize(chapter.text.join(''))
      if (!text.includes(window)) return
      hits.set(chapter.number, (hits.get(chapter.number) ?? 0) + 1)
    })
  }

  const ranked = [...hits.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([number]) => getChapter(number))
    .filter((chapter): chapter is Chapter => Boolean(chapter))

  if (ranked.length) return ranked
  if (focus.kind === 'chapter') {
    const chapter = getChapter(focus.chapter)
    return chapter ? [chapter] : []
  }
  return []
}
