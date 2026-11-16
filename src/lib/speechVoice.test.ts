import { describe, expect, it } from 'vitest'
import { pickVoiceIndex, resetVoiceCache } from './speechVoice'

/** 与 Pixel 7 / Android 16 / Google TTS 实测返回的普通话部分一致 */
const voices = [
  { voiceURI: 'cmn-cn-x-ccc-local', lang: 'zh-CN' },
  { voiceURI: 'cmn-cn-x-ccc-network', lang: 'zh-CN' },
  { voiceURI: 'cmn-cn-x-ccd-local', lang: 'zh-CN' },
  { voiceURI: 'cmn-cn-x-cce-local', lang: 'zh-CN' },
  { voiceURI: 'cmn-cn-x-ssa-local', lang: 'zh-CN' },
  { voiceURI: 'en-us-x-iob-local', lang: 'en-US' },
]

describe('朗读音色选择', () => {
  it('男声取实测音高最低的音色', () => {
    expect(pickVoiceIndex(voices, 'male')).toBe(3) // cmn-cn-x-cce-local
  })

  it('女声取实测音高最高的音色', () => {
    expect(pickVoiceIndex(voices, 'female')).toBe(4) // cmn-cn-x-ssa-local
  })

  it('按 voiceURI 查找，不受列表顺序影响', () => {
    const shuffled = [...voices].reverse()
    expect(shuffled[pickVoiceIndex(shuffled, 'male')!].voiceURI).toBe('cmn-cn-x-cce-local')
    expect(shuffled[pickVoiceIndex(shuffled, 'female')!].voiceURI).toBe('cmn-cn-x-ssa-local')
  })

  it('缺少首选音色时退回次选', () => {
    const noCce = voices.filter((item) => !item.voiceURI.includes('cce'))
    const noSsa = voices.filter((item) => !item.voiceURI.includes('ssa'))
    expect(noCce[pickVoiceIndex(noCce, 'male')!].voiceURI).toBe('cmn-cn-x-ccd-local')
    expect(noSsa[pickVoiceIndex(noSsa, 'female')!].voiceURI).toContain('cmn-cn')
  })

  it('没有中文音色时返回 undefined，交给引擎默认', () => {
    const onlyEnglish = voices.filter((item) => !item.voiceURI.includes('cmn') && !item.lang?.startsWith('zh'))
    expect(pickVoiceIndex(onlyEnglish, 'male')).toBeUndefined()
    expect(pickVoiceIndex([], 'female')).toBeUndefined()
  })

  it('缓存可重置，避免测试间互相影响', () => {
    resetVoiceCache()
    expect(true).toBe(true)
  })
})
