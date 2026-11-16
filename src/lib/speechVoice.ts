import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { SpeechVoice } from './store'

/**
 * 朗读音色选择。
 *
 * 系统 TTS 不提供音色的性别信息，Google 引擎里四个普通话音色的显示名都是
 * “Chinese China”，只能靠实测音高区分。在 Pixel 7 / Android 16 / Google TTS
 * 上测得（基频中位数，两次重复一致）：
 *   cmn-cn-x-cce  低音  1358Hz 频谱重心、166Hz 基频
 *   cmn-cn-x-ccd  略低
 *   cmn-cn-x-ccc  居中
 *   cmn-cn-x-ssa  高音  2166Hz 频谱重心、198Hz 基频
 *
 * 所以低音优先取 cce，高音优先取 ssa。插件只接受音色索引，而索引由原生侧
 * 按 voice.getName() 排序后得出，同名音色的顺序不保证跨设备稳定，
 * 因此每次朗读前都用 voiceURI 查一遍当前索引，查不到就退回引擎默认。
 */
const PREFERRED: Record<SpeechVoice, string[]> = {
  male: ['cmn-cn-x-cce-local', 'cmn-cn-x-ccd-local', 'cmn-cn-x-ccc-local'],
  female: ['cmn-cn-x-ssa-local', 'cmn-cn-x-ssa-network', 'cmn-cn-x-ccc-local', 'cmn-cn-x-cce-local'],
}

interface VoiceEntry {
  voiceURI?: string
  lang?: string
}

/** 从音色列表里挑出目标音色的索引，找不到返回 undefined */
export function pickVoiceIndex(voices: VoiceEntry[], voice: SpeechVoice): number | undefined {
  const candidates = PREFERRED[voice]
  for (const uri of candidates) {
    const index = voices.findIndex((item) => item.voiceURI === uri)
    if (index >= 0) return index
  }
  // 没有匹配的具体音色时，退回任意一个普通话本地音色
  const fallback = voices.findIndex((item) => /^zh[-_]CN/i.test(item.lang ?? '') || item.voiceURI?.includes('cmn-cn'))
  return fallback >= 0 ? fallback : undefined
}

let cachedVoices: VoiceEntry[] | null = null

async function loadVoices(): Promise<VoiceEntry[]> {
  if (cachedVoices) return cachedVoices
  try {
    const result = await TextToSpeech.getSupportedVoices()
    cachedVoices = (result.voices ?? []) as VoiceEntry[]
    return cachedVoices
  } catch {
    cachedVoices = []
    return []
  }
}

/** 供设置页展示与测试使用：列出可选音色 */
export async function resolveVoiceIndex(voice: SpeechVoice): Promise<number | undefined> {
  const voices = await loadVoices()
  if (!voices.length) return undefined
  return pickVoiceIndex(voices, voice)
}

/** 清空缓存，用于测试 */
export function resetVoiceCache(): void {
  cachedVoices = null
}
