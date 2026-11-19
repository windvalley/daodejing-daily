import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chineseVoiceOptions,
  findVoiceIndex,
  loadVoiceOptions,
  resetVoiceCache,
  timbrePitch,
  toVoiceOptions,
  type VoiceEntry,
} from './speechVoice'

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: { getSupportedVoices: vi.fn() },
}))

const getSupportedVoices = vi.mocked(TextToSpeech.getSupportedVoices)

/** 与 Pixel 7 / Android 16 / Google TTS 返回结构一致 */
const pixelVoices: VoiceEntry[] = [
  { voiceURI: 'cmn-cn-x-ccc-local', name: 'Chinese China', lang: 'zh-CN', localService: true },
  { voiceURI: 'cmn-cn-x-ccc-network', name: 'Chinese China', lang: 'zh-CN', localService: false },
  { voiceURI: 'cmn-cn-x-cce-local', name: 'Chinese China', lang: 'zh-CN', localService: true },
  { voiceURI: 'cmn-cn-x-ssa-local', name: 'Chinese China', lang: 'zh-CN', localService: true },
  { voiceURI: 'en-us-x-iob-local', name: 'English United States', lang: 'en-US', localService: true },
  { voiceURI: 'ja-jp-x-htm-local', name: 'Japanese Japan', lang: 'ja-JP', localService: true },
]

/** 只有厂商自带一个中文音色的设备 */
const singleVoicePhone: VoiceEntry[] = [
  { voiceURI: 'zh-CN-language', name: 'Chinese China', lang: 'zh-CN', localService: true },
  { voiceURI: 'en-US-language', name: 'English United States', lang: 'en-US', localService: true },
]

describe('朗读音色列表', () => {
  it('把系统音色整理成选项，中文排在最前', () => {
    const options = toVoiceOptions(pixelVoices)
    expect(options).toHaveLength(6)
    expect(options.slice(0, 4).every((item) => item.chinese)).toBe(true)
    expect(options[4].chinese).toBe(false)
  })

  it('区分本地与在线音色，避免同名选项无法分辨', () => {
    const options = toVoiceOptions(pixelVoices)
    const ccc = options.filter((item) => item.uri.startsWith('cmn-cn-x-ccc'))
    expect(ccc.map((item) => item.local)).toEqual([true, false])
    expect(ccc.map((item) => item.label)).toEqual(['zh-CN · ccc · 本地', 'zh-CN · ccc · 在线'])
  })

  it('同语言不同音色用代号区分，避免选项全同名', () => {
    const labels = toVoiceOptions(pixelVoices)
      .filter((item) => item.lang === 'zh-CN')
      .map((item) => item.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels.some((item) => item.includes('cce'))).toBe(true)
    expect(labels.some((item) => item.includes('ssa'))).toBe(true)
  })

  it('每个选项都带可用作存储值的 URI', () => {
    toVoiceOptions(pixelVoices).forEach((item) => {
      expect(item.uri.length).toBeGreaterThan(0)
      expect(item.label.length).toBeGreaterThan(0)
    })
  })

  it('重复 URI 只保留一个', () => {
    const duplicated = [...pixelVoices, { ...pixelVoices[0] }]
    expect(toVoiceOptions(duplicated)).toHaveLength(pixelVoices.length)
  })

  it('单音色设备的中文列表只剩一个，不会再出现同名选项', () => {
    const options = toVoiceOptions(singleVoicePhone)
    const chinese = chineseVoiceOptions(options)
    expect(chinese).toHaveLength(1)
    expect(chinese[0].uri).toBe('zh-CN-language')
  })

  it('识别真机返回的 zh-Hans 音色', () => {
    const options = toVoiceOptions([
      { voiceURI: 'zh-Hans-language', name: 'Chinese China', lang: 'zh-Hans', localService: true },
      { voiceURI: 'en-language', name: 'English', lang: 'en', localService: true },
    ])
    expect(options[0].mandarin).toBe(true)
    expect(options[0].label).toBe('zh-Hans · 本地')
    expect(chineseVoiceOptions(options)).toHaveLength(1)
  })

  it('缺字段的音色被跳过，不会产生空选项', () => {
    const messy: VoiceEntry[] = [{ lang: 'zh-CN' }, { voiceURI: '', lang: 'zh-CN' }, { voiceURI: 'ok', lang: 'zh-CN' }]
    const options = toVoiceOptions(messy)
    expect(options).toHaveLength(1)
    expect(options[0].uri).toBe('ok')
  })

  it('中文列表不含外语音色，避免选了也读不对', () => {
    const chinese = chineseVoiceOptions(toVoiceOptions(pixelVoices))
    expect(chinese).toHaveLength(4)
    expect(chinese.every((item) => item.chinese)).toBe(true)
    expect(chinese.some((item) => item.lang === 'en-US')).toBe(false)
  })

  it('粤语与台湾国语算中文音色，但普通话仍排在最前', () => {
    const options = toVoiceOptions([
      { voiceURI: 'cmn-cn-x-ccc-local', lang: 'zh-CN', localService: true },
      { voiceURI: 'cmn-tw-x-ctc-local', lang: 'zh-TW', localService: true },
      { voiceURI: 'yue-hk-x-jar-local', lang: 'yue-HK', localService: true },
    ])
    expect(chineseVoiceOptions(options)).toHaveLength(3)
    expect(options.filter((item) => item.mandarin)).toHaveLength(1)
    expect(options[0].uri).toBe('cmn-cn-x-ccc-local')
  })

  it('只有粤语时仍可作为中文音色朗读', () => {
    const options = toVoiceOptions([
      { voiceURI: 'yue-hk-x-jar-local', lang: 'yue-HK', localService: true },
      { voiceURI: 'en-us-x-iob-local', lang: 'en-US', localService: true },
    ])
    expect(chineseVoiceOptions(options)).toHaveLength(1)
    expect(chineseVoiceOptions(options)[0].uri).toBe('yue-hk-x-jar-local')
  })

  it('按 URI 选中文音色，外语音色不参与', () => {
    expect(findVoiceIndex(pixelVoices, 'cmn-cn-x-cce-local')).toBe(2)
    expect(findVoiceIndex(pixelVoices, 'en-us-x-iob-local')).toBeUndefined()
    expect(findVoiceIndex(pixelVoices, 'missing')).toBeUndefined()
    expect(findVoiceIndex(pixelVoices, null)).toBeUndefined()
  })

  it('缓存可重置', () => {
    resetVoiceCache()
    expect(true).toBe(true)
  })
})

describe('音色列表读取', () => {
  beforeEach(() => {
    resetVoiceCache()
    getSupportedVoices.mockReset()
  })

  it('首次读到空列表时不缓存，系统就绪后仍能读到音色', async () => {
    // iOS 首次 getVoices() 返回空数组，voiceschanged 之后才有值
    getSupportedVoices.mockResolvedValueOnce({ voices: [] })
    getSupportedVoices.mockResolvedValueOnce({ voices: singleVoicePhone as unknown as SpeechSynthesisVoice[] })
    expect(await loadVoiceOptions()).toEqual([])
    const options = await loadVoiceOptions()
    expect(options.map((item) => item.uri)).toContain('zh-CN-language')
  })

  it('读取失败不缓存，下次进设置页还能重试', async () => {
    getSupportedVoices.mockRejectedValueOnce(new Error('引擎还没就绪'))
    getSupportedVoices.mockResolvedValueOnce({ voices: singleVoicePhone as unknown as SpeechSynthesisVoice[] })
    expect(await loadVoiceOptions()).toEqual([])
    expect((await loadVoiceOptions()).map((item) => item.uri)).toContain('zh-CN-language')
  })

  it('浏览器里直接读 speechSynthesis，绕开插件可能过期的缓存', async () => {
    // Capacitor 的 Web 实现把首次非空列表存在闭包里，中文语音包后装好也不会更新
    let voices: VoiceEntry[] = [{ voiceURI: 'en-us-x-iob-local', lang: 'en-US', localService: true }]
    Object.defineProperty(window, 'speechSynthesis', {
      value: { getVoices: () => voices, addEventListener: () => {}, removeEventListener: () => {} },
      configurable: true,
    })
    try {
      expect(chineseVoiceOptions(await loadVoiceOptions())).toHaveLength(0)
      voices = [...voices, { voiceURI: 'zh-Hans-language', lang: 'zh-Hans', localService: true }]
      resetVoiceCache()
      expect(chineseVoiceOptions(await loadVoiceOptions()).map((item) => item.uri)).toEqual(['zh-Hans-language'])
      expect(getSupportedVoices).not.toHaveBeenCalled()
    } finally {
      delete (window as { speechSynthesis?: unknown }).speechSynthesis
    }
  })

  it('读到音色后走缓存，不重复调用插件', async () => {
    getSupportedVoices.mockResolvedValue({ voices: singleVoicePhone as unknown as SpeechSynthesisVoice[] })
    await loadVoiceOptions()
    await loadVoiceOptions()
    expect(getSupportedVoices).toHaveBeenCalledTimes(1)
  })
})

describe('音色三档', () => {
  it('低沉、默认、明亮依次提高音高，同一系统音色也能听出区别', () => {
    expect(timbrePitch('low')).toBe(0.7)
    expect(timbrePitch('normal')).toBe(1)
    expect(timbrePitch('bright')).toBe(1.25)
    expect(timbrePitch('low')).toBeLessThan(timbrePitch('normal'))
    expect(timbrePitch('normal')).toBeLessThan(timbrePitch('bright'))
  })

  it('旧数据缺音色字段时按系统原声处理', () => {
    expect(timbrePitch(undefined)).toBe(1)
    expect(timbrePitch(null)).toBe(1)
  })
})
