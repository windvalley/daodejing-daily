import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getAiConfigSnapshot,
  isAiConfigured,
  loadAiConfig,
  requestChat,
  subscribeAiConfig,
  type AiConfig,
  type AiErrorKind,
  type ChatMessage,
} from '../lib/ai'
import { MAX_HISTORY_MESSAGES, buildAskMessages, type AiFocus } from '../lib/aiContext'
import { checkCitations, type CitationReport } from '../lib/aiCitations'

export interface AiError {
  kind: AiErrorKind
  message: string
  /** 出错时的提问，界面用它去本地检索兜底 */
  question: string
}

export interface AiMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  /** 助手回复的引用核查结果 */
  report?: CitationReport
  /** 助手回复失败时，这条消息只承载错误，不参与后续对话历史 */
  error?: AiError
}

export interface UseAiChat {
  config: AiConfig
  configured: boolean
  messages: AiMessage[]
  pending: boolean
  send: (question: string) => Promise<void>
  cancel: () => void
  clear: () => void
}

/**
 * 会话状态。
 *
 * 只活在内存里，关掉面板就没了：落盘要处理加密、清理与配额，而这段对话并不值得，
 * 也违背「不把读者问过什么写进备份」这条约束。
 *
 * 配置走 useSyncExternalStore 订阅：在设置页填完密钥回来立刻可用，不必刷新，
 * 也不能用 effect 里 setState 的做法，那会多推一轮渲染。
 */
export function useAiChat({ focus }: { focus: AiFocus }): UseAiChat {
  const config = useSyncExternalStore(subscribeAiConfig, getAiConfigSnapshot, getAiConfigSnapshot)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [pending, setPending] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const idRef = useRef(0)
  // 卸载时中断在途请求，避免回来之后往已经消失的组件里写状态
  useEffect(() => () => controllerRef.current?.abort(), [])

  const send = useCallback(
    async (question: string) => {
      const text = question.trim()
      if (!text || pending) return

      const current = loadAiConfig()

      // 失败的那一轮内容为空，会被 buildAskMessages 剔除，模型不会把错误文案当成自己说过的话
      const history: ChatMessage[] = messages
        .map((message) => ({ role: message.role, content: message.content }))
        .slice(-MAX_HISTORY_MESSAGES)

      const asked: AiMessage = { id: (idRef.current += 1), role: 'user', content: text }
      setMessages((previous) => [...previous, asked])
      setPending(true)

      const controller = new AbortController()
      controllerRef.current = controller
      const result = await requestChat(buildAskMessages(text, focus, history, { economy: current.economy }), current, {
        signal: controller.signal,
      })
      controllerRef.current = null
      setPending(false)

      // 读者主动取消时不追加任何消息，提问留在列表里就够了
      if (result.status === 'aborted') return

      setMessages((previous) => {
        if (result.status === 'ok') {
          return [
            ...previous,
            {
              id: (idRef.current += 1),
              role: 'assistant',
              content: result.content,
              report: checkCitations(result.content),
            },
          ]
        }
        return [
          ...previous,
          {
            id: (idRef.current += 1),
            role: 'assistant',
            content: '',
            error: { kind: result.kind, message: result.message, question: text },
          },
        ]
      })
    },
    [focus, messages, pending],
  )

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setPending(false)
  }, [])

  const clear = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setPending(false)
    setMessages([])
  }, [])

  return {
    config,
    configured: isAiConfigured(config),
    messages,
    pending,
    send,
    cancel,
    clear,
  }
}
