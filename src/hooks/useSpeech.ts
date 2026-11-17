import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveVoiceIndex, timbrePitch } from '../lib/speechVoice'
import type { SpeechTimbre } from '../lib/store'

interface SpeechState {
  supported: boolean
  speaking: boolean
  speak: (text: string, rate?: number, voiceURI?: string | null, timbre?: SpeechTimbre) => void
  stop: () => void
}

interface SpeakOptions {
  text: string
  rate: number
  voiceURI: string | null
  timbre: SpeechTimbre
}

const isNative = () =>
  typeof window !== 'undefined' &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())

/** 浏览器朗读，优先挑选中文语音 */
function speakInBrowser({ text, rate, voiceURI, timbre }: SpeakOptions, onDone: () => void): (() => void) | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate
  utterance.pitch = timbrePitch(timbre)
  // 浏览器的 voiceURI 与原生音色列表不一定同名，先按 URI 精确匹配，
  // 再按包含关系匹配，都没有就用第一个中文音色
  const voices = window.speechSynthesis.getVoices()
  const byURI = voiceURI ? voices.find((item) => item.voiceURI === voiceURI) : undefined
  const byPartial = voiceURI
    ? voices.find((item) => voiceURI.includes(item.voiceURI) || item.voiceURI.includes(voiceURI))
    : undefined
  const picked =
    byURI ?? byPartial ?? voices.find((item) => /zh[-_]CN|Chinese|中文|普通话/i.test(`${item.lang} ${item.name}`))
  if (picked) utterance.voice = picked
  utterance.onend = onDone
  utterance.onerror = onDone
  window.speechSynthesis.speak(utterance)
  return () => window.speechSynthesis.cancel()
}

/**
 * 朗读：APK 里走系统 TTS（WebView 的 speechSynthesis 不可靠），
 * 浏览器里回落到 Web Speech API。两种环境都支持中途停止。
 */
export function useSpeech(): SpeechState {
  const native = isNative()
  const supported = native || (typeof window !== 'undefined' && 'speechSynthesis' in window)
  const [speaking, setSpeaking] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    if (native) {
      void TextToSpeech.stop()
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    stopRef.current = null
    setSpeaking(false)
  }, [native])

  const speak = useCallback(
    (text: string, rate = 0.9, voiceURI: string | null = null, timbre: SpeechTimbre = 'normal') => {
      if (!supported || !text.trim()) return
      stop()
      setSpeaking(true)
      const done = () => {
        stopRef.current = null
        setSpeaking(false)
      }

      if (native) {
        // 音色索引要现查：原生侧按音色名排序，索引不保证跨设备稳定
        void resolveVoiceIndex(voiceURI).then((voiceIndex) => {
          TextToSpeech.speak({
            text,
            lang: 'zh-CN',
            rate,
            pitch: timbrePitch(timbre),
            category: 'playback',
            ...(voiceIndex === undefined ? {} : { voice: voiceIndex }),
          })
            .then(done)
            .catch((error) => {
              console.error('系统朗读失败', error)
              done()
            })
        })
        stopRef.current = () => {
          void TextToSpeech.stop()
        }
        return
      }

      stopRef.current = speakInBrowser({ text, rate, voiceURI, timbre }, done)
      if (!stopRef.current) done()
    },
    [native, supported, stop],
  )

  useEffect(() => {
    return () => {
      if (native) void TextToSpeech.stop()
      else if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [native])

  return { supported, speaking, speak, stop }
}
