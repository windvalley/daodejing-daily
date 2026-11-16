import { getChapterGloss, glossMatchesChapter } from '../data/glosses'
import type { Chapter } from '../data/chapters'

/**
 * 朗读读音校正。
 *
 * 系统 TTS 只接收纯文本，插件也没有 SSML 或注音标记可用，多音字全靠引擎自己猜，
 * 「不见可欲」的「见」就会读成 jiàn。我们已经有全书逐字注音，于是把它用在朗读上：
 * 对引擎必定读错的字，换成一个读音相同、读法稳定的同音字再送去合成。
 * 只影响朗读，页面显示仍用原文。
 *
 * key 写作「字|目标拼音」，value 是同音替字。选字标准：现代汉语里读音稳定、
 * 不会二次歧义的常用字。引擎本身能读对的（如「君子」的「子」）不要收录。
 */
const HOMOPHONES: Record<string, string> = {
  '为|wéi': '维',
  '夫|fú': '扶',
  '处|chǔ': '楚',
  '长|cháng': '常',
  '见|xiàn': '现',
  '恶|wù': '务',
  '畜|xù': '蓄',
  '邪|yé': '耶',
  '几|jī': '机',
  '强|qiǎng': '抢',
  '歙|xī': '希',
  '没|mò': '末',
  '儽|lěi': '磊',
  '丧|sāng': '桑',
  '应|yìng': '硬',
  '薄|bó': '博',
  '塞|sè': '瑟',
  '好|hào': '耗',
  '重|chóng': '崇',
  '徼|jiào': '叫',
  '和|hè': '贺',
  '数|shuò': '朔',
  '数|shǔ': '暑',
  '知|zhì': '智',
  '诘|jié': '杰',
  '阿|ē': '婀',
  '泊|bó': '博',
  '飂|liáo': '辽',
  '食|sì': '四',
  '朝|zhāo': '招',
  '观|guàn': '贯',
  '乘|shèng': '胜',
  '还|huán': '环',
  '衣|yì': '义',
  '乐|yuè': '月',
  '施|yì': '亦',
  '虺|huǐ': '悔',
  '号|háo': '豪',
  '嗄|shà': '霎',
  '累|lěi': '磊',
  '行|háng': '航',
  '被|pī': '披',
  '与|yú': '欤',
  '什|shí': '十',
}

/**
 * 有意不做替换的字音，引擎在这些语境里本来就读对，换字反而更生硬：
 * - 子 zǐ：之子、君子、赤子、天子，引擎读 zǐ，注音的 zǐ 只是与轻声有别。
 * - 似 sì：似万物之宗、似不肖，引擎读 sì。
 */
export const SPEECH_KEEP_AS_IS = ['子|zǐ', '似|sì'] as const

/** 单字朗读用字：命中校正表时返回同音替字 */
export function speechChar(char: string, pinyin?: string): string {
  if (!pinyin) return char
  return HOMOPHONES[`${char}|${pinyin}`] ?? char
}

/** 一章正文的朗读文本，已做读音校正；注音缺失或对不齐时退回原文 */
export function chapterSpeechBody(chapter: Chapter): string {
  const gloss = getChapterGloss(chapter.number)
  if (!gloss || !glossMatchesChapter(gloss, chapter)) return chapter.text.join('')
  return gloss.map((line) => line.map((token) => speechChar(token.char, token.pinyin)).join('')).join('')
}

/** 完整朗读文本：章号、章题加正文 */
export function chapterSpeechText(chapter: Chapter): string {
  return `第${chapter.number}章，${chapter.title}。${chapterSpeechBody(chapter)}`
}

/** 供测试使用：导出校正表条目 */
export function homophoneEntries(): [string, string][] {
  return Object.entries(HOMOPHONES)
}
