import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechState {
  supported: boolean
  speaking: boolean
  speak: (text: string, rate?: number) => void
  stop: () => void
}

interface SpeakOptions {
  text: string
  rate: number
}

const isNative = () =>
  typeof window !== 'undefined' &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())

/** 浏览器朗读，优先挑选中文语音 */
function speakInBrowser({ text, rate }: SpeakOptions, onDone: () => void): (() => void) | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate
  utterance.pitch = 0.95
  const chinese = window.speechSynthesis
    .getVoices()
    .find((voice) => /zh[-_]CN|Chinese|中文|普通话/i.test(`${voice.lang} ${voice.name}`))
  if (chinese) utterance.voice = chinese
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
    (text: string, rate = 0.9) => {
      if (!supported || !text.trim()) return
      stop()
      setSpeaking(true)
      const done = () => {
        stopRef.current = null
        setSpeaking(false)
      }

      if (native) {
        TextToSpeech.speak({ text, lang: 'zh-CN', rate, pitch: 0.95, category: 'playback' })
          .then(done)
          .catch((error) => {
            console.error('系统朗读失败', error)
            done()
          })
        stopRef.current = () => {
          void TextToSpeech.stop()
        }
        return
      }

      stopRef.current = speakInBrowser({ text, rate }, done)
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
