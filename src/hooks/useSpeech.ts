import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechVoice } from '../lib/store'
import { resolveVoiceIndex } from '../lib/speechVoice'

interface SpeechState {
  supported: boolean
  speaking: boolean
  speak: (text: string, rate?: number, voice?: SpeechVoice) => void
  stop: () => void
}

interface SpeakOptions {
  text: string
  rate: number
  voice: SpeechVoice
}

const isNative = () =>
  typeof window !== 'undefined' &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())

/** 浏览器朗读，优先挑选中文语音 */
function speakInBrowser({ text, rate, voice }: SpeakOptions, onDone: () => void): (() => void) | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate
  utterance.pitch = 0.95
  // 浏览器音色名里偶尔带性别标记，能认出来就按偏好挑，认不出就用第一个中文音色
  const chinese = window.speechSynthesis
    .getVoices()
    .filter((item) => /zh[-_]CN|Chinese|中文|普通话/i.test(`${item.lang} ${item.name}`))
  const gendered = chinese.find((item) => {
    const lower = item.name.toLowerCase()
    return voice === 'female' ? /female|女/.test(lower) : /male|男/.test(lower)
  })
  const picked = gendered ?? chinese[0]
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
    (text: string, rate = 0.9, voice: SpeechVoice = 'male') => {
      if (!supported || !text.trim()) return
      stop()
      setSpeaking(true)
      const done = () => {
        stopRef.current = null
        setSpeaking(false)
      }

      if (native) {
        // 音色索引要现查：原生侧按音色名排序，同名音色顺序不保证跨设备一致
        void resolveVoiceIndex(voice).then((voiceIndex) => {
          TextToSpeech.speak({
            text,
            lang: 'zh-CN',
            rate,
            pitch: 1,
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

      stopRef.current = speakInBrowser({ text, rate, voice }, done)
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
