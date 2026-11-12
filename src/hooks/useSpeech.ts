import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechState {
  supported: boolean
  speaking: boolean
  speak: (text: string, rate?: number) => void
  stop: () => void
}

/** 浏览器朗读，优先挑选中文语音。不支持时安全降级。 */
export function useSpeech(): SpeechState {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string, rate = 0.9) => {
      if (!supported || !text.trim()) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = rate
      utterance.pitch = 0.95
      const voices = window.speechSynthesis.getVoices()
      const chinese = voices.find((voice) => /zh[-_]CN|Chinese|中文|普通话/i.test(`${voice.lang} ${voice.name}`))
      if (chinese) utterance.voice = chinese
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      utteranceRef.current = utterance
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [supported],
  )

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
    }
  }, [supported])

  return { supported, speaking, speak, stop }
}
