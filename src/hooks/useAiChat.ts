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
  /** 正在流式写入的这条消息，界面据此显示光标 */
  streaming?: boolean
  /** 读者点了停止，回答到此为止 */
  partial?: boolean
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
      // 先占一条空的助手消息，增量往里追加，读者能看到字一个个出来
      const replyId = (idRef.current += 1)
      setMessages((previous) => [...previous, asked, { id: replyId, role: 'assistant', content: '', streaming: true }])
      setPending(true)

      const controller = new AbortController()
      controllerRef.current = controller
      const result = await requestChat(
        buildAskMessages(text, focus, history, { economy: current.economy, webSearch: current.webSearch }),
        current,
        {
          signal: controller.signal,
          onDelta: (chunk) => {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === replyId ? { ...message, content: message.content + chunk } : message,
              ),
            )
          },
        },
      )
      controllerRef.current = null
      setPending(false)

      setMessages((previous) => {
        // 取消时已经写出来的部分留着，标记成不完整，且不做引用核查
        if (result.status === 'aborted') {
          return previous.map((message) =>
            message.id === replyId && message.content ? { ...message, streaming: false, partial: true } : message,
          )
        }

        if (result.status === 'ok') {
          return previous.map((message) =>
            message.id === replyId
              ? {
                  ...message,
                  content: result.content,
                  streaming: false,
                  partial: result.partial === true,
                  // 被截断的回答做引用核查没有意义，只会把断句判成「引文有问题」
                  report: result.partial ? undefined : checkCitations(result.content),
                }
              : message,
          )
        }

        // 一个字都没收到时把占位消息换成错误块；已经出了字就保留正文，不让错误覆盖已写内容
        return previous.map((message) => {
          if (message.id !== replyId) return message
          return message.content
            ? { ...message, streaming: false, partial: true }
            : { ...message, streaming: false, error: { kind: result.kind, message: result.message, question: text } }
        })
      })
    },
    [focus, messages, pending],
  )

  /**
   * 只发取消信号，不清 pending。
   * 清了会让输入框立刻可以再发，而旧请求可能还没真正结束，
   * 两个请求并发时 controllerRef 被覆盖，旧的那个再也停不下来。
   * 等请求自己退出来，在结果处理里统一清掉。
   */
  const cancel = useCallback(() => {
    controllerRef.current?.abort()
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
