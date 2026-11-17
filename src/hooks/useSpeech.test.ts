import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetVoiceCache } from '../lib/speechVoice'
import { useSpeech } from './useSpeech'

const mocks = vi.hoisted(() => ({
  speak: vi.fn<(options: Record<string, unknown>) => Promise<void>>(),
  stop: vi.fn<() => Promise<void>>(),
  getSupportedVoices: vi.fn<() => Promise<{ voices: unknown[] }>>(),
}))

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    speak: mocks.speak,
    stop: mocks.stop,
    getSupportedVoices: mocks.getSupportedVoices,
  },
}))

/** 与真机一致：只有一个中文音色，外加一个不能读中文的英文音色 */
const voices = [
  { voiceURI: 'zh-Hans', name: 'Chinese China', lang: 'zh-Hans', localService: true },
  { voiceURI: 'en', name: 'English', lang: 'en', localService: true },
]

describe('朗读音色传给系统引擎', () => {
  beforeEach(() => {
    mocks.speak.mockReset().mockResolvedValue(undefined)
    mocks.stop.mockReset().mockResolvedValue(undefined)
    mocks.getSupportedVoices.mockReset().mockResolvedValue({ voices })
    resetVoiceCache()
    Object.defineProperty(window, 'Capacitor', {
      value: { isNativePlatform: () => true },
      configurable: true,
    })
  })

  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor
  })

  it('低沉音色降低音高，并使用选中的中文音色索引', async () => {
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.speak('道可道，非常道。', 0.9, 'zh-Hans', 'low'))

    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(1))
    expect(mocks.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: '道可道，非常道。', rate: 0.9, pitch: 0.7, voice: 0, lang: 'zh-CN' }),
    )
  })

  it('默认音色用原声音高', async () => {
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.speak('上善若水', 1, null, 'normal'))

    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(1))
    const options = mocks.speak.mock.calls[0][0]
    expect(options.pitch).toBe(1)
    expect(options).not.toHaveProperty('voice')
  })

  it('明亮音色提高音高', async () => {
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.speak('上善若水', 1, null, 'bright'))

    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(1))
    expect(mocks.speak.mock.calls[0][0].pitch).toBe(1.25)
  })

  it('外语音色不参与朗读，退回引擎默认音色', async () => {
    const { result } = renderHook(() => useSpeech())
    act(() => result.current.speak('道可道', 1, 'en', 'normal'))

    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(1))
    expect(mocks.speak.mock.calls[0][0]).not.toHaveProperty('voice')
  })
})
