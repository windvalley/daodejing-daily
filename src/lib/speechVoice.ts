import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { SpeechTimbre } from './store'

/**
 * 朗读音色。
 *
 * 系统 TTS 不提供音色的性别信息，不少手机甚至只有一个中文音色，
 * 只列系统音色时「换一个音色」往往没有任何听感变化。
 * 所以音色分两层：
 *   - 低沉、明亮用音高实现，不依赖系统提供几个音色；
 *   - 系统音色只在设备确实有多个中文音色时才让用户挑。
 *
 * 系统音色的选中结果存 voiceURI。朗读时再按 URI 查当前索引，
 * 因为原生侧按音色名排序，索引不保证跨设备稳定。
 */
export interface VoiceEntry {
  voiceURI?: string
  name?: string
  lang?: string
  localService?: boolean
}

export interface VoiceOption {
  /** 音色标识，存进设置的就是它 */
  uri: string
  /** 展示名，如「中文（中国）」 */
  label: string
  /** 语音标签，如 zh-CN */
  lang: string
  /** 是否为本地音色，网络音色需要联网 */
  local: boolean
  /** 是否为中文音色 */
  chinese: boolean
  /** 是否为普通话，默认只显示这一批 */
  mandarin: boolean
}

/** 三档音色对应的音高倍数。0.7 约降六个半音，听感明显更低 */
export const TIMBRE_PITCH: Record<SpeechTimbre, number> = {
  low: 0.7,
  normal: 1,
  bright: 1.25,
}

/** 取音高倍数；旧数据或非法值按系统原声处理 */
export function timbrePitch(timbre: SpeechTimbre | null | undefined): number {
  return TIMBRE_PITCH[timbre ?? 'normal'] ?? TIMBRE_PITCH.normal
}

/** 普通话：cmn-cn 前缀，或简体中文标签（真机上常见 zh-Hans） */
const MANDARIN = /^(cmn-cn|zh[-_](CN|Hans))/i
/** 中文大类，含粤语与台湾国语 */
const CHINESE = /^(zh|cmn|yue)/i

/** 把系统音色整理成可展示的选项，中文音色排在前面 */
export function toVoiceOptions(voices: VoiceEntry[]): VoiceOption[] {
  const options: VoiceOption[] = []
  const seen = new Set<string>()
  for (const voice of voices) {
    const uri = voice.voiceURI
    if (!uri || seen.has(uri)) continue
    seen.add(uri)
    const lang = voice.lang ?? ''
    // 同一语言常同时有多个音色，显示名与标签都一样，只能靠 URI 里的音色代号区分，
    // 例如 cmn-cn-x-ccc-local 里的 ccc。取不到代号时退回序号。
    const code = /-x-([a-z]{3})(?:-|$)/.exec(uri)?.[1]
    const kind = voice.localService ? '本地' : '在线'
    const base = lang || uri
    const label = code ? `${base} · ${code} · ${kind}` : `${base} · ${kind}`
    options.push({
      uri,
      label,
      lang,
      local: Boolean(voice.localService),
      chinese: CHINESE.test(lang || uri),
      mandarin: MANDARIN.test(lang || uri),
    })
  }
  // 排序：普通话 > 其它中文 > 外语
  return options.sort((a, b) => {
    if (a.mandarin !== b.mandarin) return a.mandarin ? -1 : 1
    if (a.chinese !== b.chinese) return a.chinese ? -1 : 1
    if (a.lang !== b.lang) return a.lang.localeCompare(b.lang)
    return a.uri.localeCompare(b.uri)
  })
}

/** 中文音色。朗读内容是中文，外语音色选了也读不对，不进入列表 */
export function chineseVoiceOptions(options: VoiceOption[]): VoiceOption[] {
  return options.filter((item) => item.chinese)
}

let cachedVoices: VoiceEntry[] | null = null

/**
 * 浏览器里直接读 speechSynthesis。Capacitor 的 Web 实现会把首次非空结果存进闭包，
 * 中文语音包后装好、voiceschanged 触发后它仍返回旧表，绕开插件才能读到新列表。
 */
function readBrowserVoices(): VoiceEntry[] | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  return window.speechSynthesis.getVoices() as unknown as VoiceEntry[]
}

/**
 * 读取系统音色列表，失败或环境不支持时返回空数组。
 * 空结果不缓存：iOS 首次 getVoices() 常常是空的，要等 voiceschanged 之后才有值，
 * 把空数组缓存下来会让设置页永远停在「正在读取系统音色…」。
 * 读取失败同样不缓存，下次进设置页还能重试。
 */
export async function loadVoiceOptions(): Promise<VoiceOption[]> {
  if (cachedVoices?.length) return toVoiceOptions(cachedVoices)
  const browserVoices = Capacitor.isNativePlatform() ? null : readBrowserVoices()
  if (browserVoices) {
    if (browserVoices.length) cachedVoices = browserVoices
    return toVoiceOptions(browserVoices)
  }
  try {
    const result = await TextToSpeech.getSupportedVoices()
    const voices = (result.voices ?? []) as VoiceEntry[]
    if (voices.length) cachedVoices = voices
    return toVoiceOptions(voices)
  } catch {
    return []
  }
}

/**
 * 订阅浏览器音色列表的更新。
 * 原生壳的音色随插件就绪，不触发该事件，返回空的清理函数即可。
 */
export function subscribeVoicesChanged(listener: () => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return () => {}
  const synthesis = window.speechSynthesis
  synthesis.addEventListener('voiceschanged', listener)
  return () => synthesis.removeEventListener('voiceschanged', listener)
}

/** 在音色列表里按 URI 找中文音色的索引；非中文与找不到都返回 undefined */
export function findVoiceIndex(voices: VoiceEntry[], voiceURI: string | null): number | undefined {
  if (!voiceURI) return undefined
  const index = voices.findIndex(
    (voice) => voice.voiceURI === voiceURI && CHINESE.test(voice.lang || voice.voiceURI || ''),
  )
  return index >= 0 ? index : undefined
}

/** 按 URI 找中文音色索引；找不到返回 undefined，调用方应退回引擎默认音色 */
export async function resolveVoiceIndex(voiceURI: string | null): Promise<number | undefined> {
  if (!voiceURI) return undefined
  if (!cachedVoices) await loadVoiceOptions()
  return findVoiceIndex(cachedVoices ?? [], voiceURI)
}

/** 已选音色在当前设备上是否可用，用于提示用户换设备后重选 */
export async function isVoiceAvailable(voiceURI: string | null): Promise<boolean> {
  if (!voiceURI) return true
  return (await resolveVoiceIndex(voiceURI)) !== undefined
}

/** 清空缓存，供测试与切换设备后重新读取使用 */
export function resetVoiceCache(): void {
  cachedVoices = null
}
