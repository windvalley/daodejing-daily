import { TextToSpeech } from '@capacitor-community/text-to-speech'

/**
 * 朗读音色。
 *
 * 系统 TTS 不提供音色的性别信息，Google 引擎里几个普通话音色的显示名甚至完全相同
 * （都叫 “Chinese China”），靠推断性别选音色在不同手机上会失效：
 * 没有 Google 那几个音色的设备上，男声女声会退回同一个音色，听起来毫无区别。
 *
 * 所以这里不做性别判断，改成把设备支持的音色全部列出来由用户自己选，
 * 选中结果存 voiceURI。朗读时再按 URI 查当前索引，因为原生侧按音色名排序，
 * 索引不保证跨设备稳定。
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

/** 普通话：cmn-cn 前缀，或 zh-CN 标签 */
const MANDARIN = /^(cmn-cn|zh[-_]CN)/i
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

/** 默认展示的选项：普通话音色；没有普通话时退回全部中文音色 */
export function defaultVoiceOptions(options: VoiceOption[]): VoiceOption[] {
  const mandarin = options.filter((item) => item.mandarin)
  if (mandarin.length) return mandarin
  return options.filter((item) => item.chinese)
}

let cachedVoices: VoiceEntry[] | null = null

/** 读取系统音色列表，失败或环境不支持时返回空数组 */
export async function loadVoiceOptions(): Promise<VoiceOption[]> {
  if (cachedVoices) return toVoiceOptions(cachedVoices)
  try {
    const result = await TextToSpeech.getSupportedVoices()
    cachedVoices = (result.voices ?? []) as VoiceEntry[]
    return toVoiceOptions(cachedVoices)
  } catch {
    cachedVoices = []
    return []
  }
}

/** 按 URI 找音色索引；找不到返回 undefined，调用方应退回引擎默认音色 */
export async function resolveVoiceIndex(voiceURI: string | null): Promise<number | undefined> {
  if (!voiceURI) return undefined
  if (!cachedVoices) await loadVoiceOptions()
  const voices = cachedVoices ?? []
  const index = voices.findIndex((voice) => voice.voiceURI === voiceURI)
  return index >= 0 ? index : undefined
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
