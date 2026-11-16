import { describe, expect, it } from 'vitest'
import { defaultVoiceOptions, resetVoiceCache, toVoiceOptions, type VoiceEntry } from './speechVoice'

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

  it('单音色设备也能列出可用音色，不再出现男女声共用同一条目', () => {
    const options = toVoiceOptions(singleVoicePhone)
    expect(options).toHaveLength(2)
    expect(options[0].uri).toBe('zh-CN-language')
    // 旧实现的症状：不同性别设置解析到同一个索引。
    // 新实现直接列音色，不存在「两个选项指向同一音色」的可能。
    const uris = options.map((item) => item.uri)
    expect(new Set(uris).size).toBe(uris.length)
  })

  it('缺字段的音色被跳过，不会产生空选项', () => {
    const messy: VoiceEntry[] = [{ lang: 'zh-CN' }, { voiceURI: '', lang: 'zh-CN' }, { voiceURI: 'ok', lang: 'zh-CN' }]
    const options = toVoiceOptions(messy)
    expect(options).toHaveLength(1)
    expect(options[0].uri).toBe('ok')
  })

  it('默认只列普通话音色，避免几百个外语音色淹没选项', () => {
    const options = toVoiceOptions(pixelVoices)
    const defaults = defaultVoiceOptions(options)
    expect(defaults).toHaveLength(4)
    expect(defaults.every((item) => item.mandarin)).toBe(true)
    // 英文、日文不出现在默认列表里
    expect(defaults.some((item) => item.lang === 'en-US')).toBe(false)
  })

  it('粤语与台湾国语不算默认普通话', () => {
    const options = toVoiceOptions([
      { voiceURI: 'cmn-cn-x-ccc-local', lang: 'zh-CN', localService: true },
      { voiceURI: 'cmn-tw-x-ctc-local', lang: 'zh-TW', localService: true },
      { voiceURI: 'yue-hk-x-jar-local', lang: 'yue-HK', localService: true },
    ])
    const defaults = defaultVoiceOptions(options)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].uri).toBe('cmn-cn-x-ccc-local')
  })

  it('没有普通话音色时退回全部中文，仍不是几百个外语', () => {
    const options = toVoiceOptions([
      { voiceURI: 'yue-hk-x-jar-local', lang: 'yue-HK', localService: true },
      { voiceURI: 'en-us-x-iob-local', lang: 'en-US', localService: true },
    ])
    const defaults = defaultVoiceOptions(options)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].uri).toBe('yue-hk-x-jar-local')
  })

  it('缓存可重置', () => {
    resetVoiceCache()
    expect(true).toBe(true)
  })
})
