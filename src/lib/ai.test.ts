import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_STORAGE_KEY,
  EMPTY_AI_CONFIG,
  clearAiConfig,
  isAiConfigured,
  loadAiConfig,
  contentOfSseData,
  errorOfSseData,
  normalizeEndpoint,
  requestChat,
  sanitizeAiConfig,
  saveAiConfig,
  splitSseEvents,
  type AiConfig,
  type ChatMessage,
} from './ai'

const config: AiConfig = {
  endpoint: 'https://example.com/v1/chat/completions',
  model: 'test-model',
  apiKey: 'sk-test',
  economy: false,
  webSearch: false,
}

const messages: ChatMessage[] = [{ role: 'user', content: '道可道是什么意思？' }]

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('配置读写', () => {
  it('清洗时保留已知字段、去掉多余字段并去掉首尾空白', () => {
    const clean = sanitizeAiConfig({
      endpoint: '  https://example.com/v1/chat/completions  ',
      model: ' test-model ',
      apiKey: ' sk-test ',
      economy: true,
      nickname: '不该保留',
    })
    expect(clean).toEqual({
      endpoint: 'https://example.com/v1/chat/completions',
      model: 'test-model',
      apiKey: 'sk-test',
      economy: true,
      webSearch: false,
    })
  })

  it('非对象输入退回空配置', () => {
    expect(sanitizeAiConfig(null)).toEqual(EMPTY_AI_CONFIG)
    expect(sanitizeAiConfig('sk-test')).toEqual(EMPTY_AI_CONFIG)
  })

  it('三项齐全才算配置完成，省流开关不影响可用性', () => {
    expect(isAiConfigured(config)).toBe(true)
    expect(isAiConfigured({ ...config, economy: true })).toBe(true)
    expect(isAiConfigured({ ...config, apiKey: '' })).toBe(false)
    expect(isAiConfigured({ ...config, endpoint: '' })).toBe(false)
    expect(isAiConfigured({ ...config, model: '' })).toBe(false)
  })

  it('配置存在独立的键里，不落进学习数据', () => {
    saveAiConfig(config)
    expect(window.localStorage.getItem(AI_STORAGE_KEY)).toBeTruthy()
    expect(window.localStorage.getItem('daodejing.data.v1')).toBeNull()
    expect(loadAiConfig()).toEqual(config)
  })

  it('存储内容损坏时退回空配置而不是抛错', () => {
    window.localStorage.setItem(AI_STORAGE_KEY, '{不是 JSON')
    expect(loadAiConfig()).toEqual(EMPTY_AI_CONFIG)
  })

  it('清除后读回空配置', () => {
    saveAiConfig(config)
    clearAiConfig()
    expect(loadAiConfig()).toEqual(EMPTY_AI_CONFIG)
  })
})

describe('请求', () => {
  it('没有配置时直接返回 not-configured，不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await requestChat(messages, EMPTY_AI_CONFIG, { fetchImpl })
    expect(result).toEqual({ status: 'error', kind: 'not-configured', message: '还没有配置 AI 服务。' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('离线时不发请求', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const fetchImpl = vi.fn()
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result.status).toBe('error')
    expect(result).toMatchObject({ kind: 'offline' })
    expect(fetchImpl).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('把地址、模型与密钥按 OpenAI 兼容格式发出去', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: ' 道是总规律。 ' } }] }))
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result).toEqual({ status: 'ok', content: '道是总规律。' })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(config.endpoint)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    expect(JSON.parse(init.body)).toEqual({ model: 'test-model', messages, stream: false })
  })

  it('401 与 403 归一化为 auth，并带出厂商的错误文案', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Invalid API key' } }, 401))
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result).toEqual({ status: 'error', kind: 'auth', message: 'Invalid API key' })
  })

  it('402 与 429 归一化为 quota', async () => {
    for (const status of [402, 429]) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, status))
      const result = await requestChat(messages, config, { fetchImpl })
      expect(result).toMatchObject({ status: 'error', kind: 'quota' })
    }
  })

  it('其他状态码归一化为 network 并保留状态码', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500))
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result).toEqual({ status: 'error', kind: 'network', message: '请求失败（HTTP 500）' })
  })

  it('错误体不是 JSON 时仍然按状态码判定', async () => {
    const response = {
      ok: false,
      status: 403,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response
    const result = await requestChat(messages, config, { fetchImpl: vi.fn().mockResolvedValue(response) })
    expect(result).toMatchObject({ kind: 'auth' })
  })

  it('返回结构不对时归一化为 parse', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }))
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result).toMatchObject({ status: 'error', kind: 'parse' })
  })

  it('内容为空也按 parse 处理，避免把空对话插进界面', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '   ' } }] }))
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result).toMatchObject({ kind: 'parse' })
  })

  it('超过等待时间返回 timeout，而不是误报成取消', async () => {
    const hangingFetch = (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    const result = await requestChat(messages, config, {
      fetchImpl: hangingFetch as unknown as typeof fetch,
      timeoutMs: 10,
    })
    expect(result).toMatchObject({ status: 'error', kind: 'timeout' })
  })

  it('读者主动取消返回 aborted，不算错误', async () => {
    const controller = new AbortController()
    const hangingFetch = (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    const pending = requestChat(messages, config, {
      fetchImpl: hangingFetch as unknown as typeof fetch,
      signal: controller.signal,
      timeoutMs: 5000,
    })
    controller.abort()
    expect(await pending).toEqual({ status: 'aborted' })
  })

  it('调用前就已取消时立刻返回 aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn()
    const result = await requestChat(messages, config, { fetchImpl, signal: controller.signal })
    expect(result).toEqual({ status: 'aborted' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('请求抛错归一化为 network', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result).toEqual({ status: 'error', kind: 'network', message: 'Failed to fetch' })
  })
})

describe('地址补全', () => {
  it('只填服务根地址时补成完整接口地址', () => {
    expect(normalizeEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(normalizeEndpoint('https://api.deepseek.com/')).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(normalizeEndpoint('  https://api.deepseek.com  ')).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('填到版本段时只补后半截', () => {
    expect(normalizeEndpoint('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions')
    expect(normalizeEndpoint('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('已经是完整接口地址时不动', () => {
    expect(normalizeEndpoint('https://api.deepseek.com/v1/chat/completions')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(normalizeEndpoint('https://api.deepseek.com/chat/completions/')).toBe(
      'https://api.deepseek.com/chat/completions',
    )
  })

  it('自定义网关路径不猜，原样保留', () => {
    expect(normalizeEndpoint('https://gw.example.com/proxy/llm')).toBe('https://gw.example.com/proxy/llm')
    expect(normalizeEndpoint('https://gw.example.com/proxy/llm/v1')).toBe(
      'https://gw.example.com/proxy/llm/v1/chat/completions',
    )
  })

  it('空值与非法输入不制造出奇怪地址', () => {
    expect(normalizeEndpoint('')).toBe('')
    expect(normalizeEndpoint('   ')).toBe('')
    expect(normalizeEndpoint('api.deepseek.com')).toBe('api.deepseek.com')
  })

  it('请求真正打到补全后的地址，而不是读者填的根地址', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '好' } }] }))
    await requestChat(messages, { ...config, endpoint: 'https://api.deepseek.com' }, { fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/chat/completions')
  })
})

describe('联网工具', () => {
  it('未开启联网时请求体不带 tools，保证老配置行为不变', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '好' } }] }))
    await requestChat(messages, { ...config, webSearch: false }, { fetchImpl })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.tools).toBeUndefined()
  })

  it('开启后按 DeepSeek 的工具名声明 deepseek_web_search', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '好' } }] }))
    await requestChat(messages, { ...config, webSearch: true }, { fetchImpl })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    // 写成 OpenAI 的 web_search 会被服务端 422 拒绝
    expect(body.tools).toEqual([{ type: 'deepseek_web_search' }])
  })

  it('联网开关默认关闭，且能被清洗保留', () => {
    expect(EMPTY_AI_CONFIG.webSearch).toBe(false)
    expect(sanitizeAiConfig({ endpoint: 'x', model: 'y', apiKey: 'z', webSearch: true }).webSearch).toBe(true)
    expect(sanitizeAiConfig({ endpoint: 'x', model: 'y', apiKey: 'z' }).webSearch).toBe(false)
  })
})

describe('SSE 解析', () => {
  it('按空行切事件，半截留在 rest 里', () => {
    const { events, rest } = splitSseEvents('data: {"a":1}\n\ndata: {"a":2}\n\ndata: {"a":3')
    expect(events).toEqual(['{"a":1}', '{"a":2}'])
    expect(rest).toBe('data: {"a":3')
  })

  it('兼容 CRLF 换行', () => {
    const { events } = splitSseEvents('data: {"a":1}\r\n\r\n')
    expect(events).toEqual(['{"a":1}'])
  })

  it('忽略非 data 行与空事件', () => {
    const { events } = splitSseEvents(': keep-alive\n\nevent: ping\n\ndata: {"a":1}\n\n')
    expect(events).toEqual(['{"a":1}'])
  })

  it('只取 delta.content，丢掉 reasoning_content', () => {
    const reasoning = JSON.stringify({ choices: [{ delta: { reasoning_content: '草稿' } }] })
    const body = JSON.stringify({ choices: [{ delta: { content: '正文' } }] })
    expect(contentOfSseData(reasoning)).toBeNull()
    expect(contentOfSseData(body)).toBe('正文')
  })

  it('[DONE] 与非 JSON 不产生正文', () => {
    expect(contentOfSseData('[DONE]')).toBeNull()
    expect(contentOfSseData('{坏掉的')).toBeNull()
  })

  it('流里的 error 块能被识别', () => {
    expect(errorOfSseData(JSON.stringify({ error: { message: '额度不足' } }))).toBe('额度不足')
    expect(errorOfSseData(JSON.stringify({ choices: [] }))).toBeNull()
  })
})

describe('流式请求', () => {
  /** 把若干字符串拼成一个可分块读取的流响应 */
  function streamResponse(chunks: string[], contentType = 'text/event-stream'): Response {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      },
    })
    return { ok: true, status: 200, headers: new Headers({ 'content-type': contentType }), body } as unknown as Response
  }

  const sse = (delta: object) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`

  it('逐段回调并拼出完整正文', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(streamResponse([sse({ content: '道' }), sse({ content: '可道' }), 'data: [DONE]\n\n']))
    const deltas: string[] = []
    const result = await requestChat(messages, config, { fetchImpl, onDelta: (t) => deltas.push(t) })
    expect(deltas).toEqual(['道', '可道'])
    expect(result).toEqual({ status: 'ok', content: '道可道' })
  })

  it('一个事件被拆成两次到达时也能拼回来', async () => {
    const full = sse({ content: '上善若水' })
    const cut = Math.floor(full.length / 2)
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(streamResponse([full.slice(0, cut), full.slice(cut), 'data: [DONE]\n\n']))
    const result = await requestChat(messages, config, { fetchImpl, onDelta: () => {} })
    expect(result).toEqual({ status: 'ok', content: '上善若水' })
  })

  it('请求体带上 stream 与 include_usage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([sse({ content: '好' }), 'data: [DONE]\n\n']))
    await requestChat(messages, config, { fetchImpl, onDelta: () => {} })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  it('不传 onDelta 时仍是整段请求', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '整段' } }] }))
    const result = await requestChat(messages, config, { fetchImpl })
    expect(result).toEqual({ status: 'ok', content: '整段' })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(false)
  })

  it('网关忽略 stream 仍返回 JSON 时也能拿到正文', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '退化成整段' } }] }))
    const deltas: string[] = []
    const result = await requestChat(messages, config, { fetchImpl, onDelta: (t) => deltas.push(t) })
    expect(result).toEqual({ status: 'ok', content: '退化成整段' })
    expect(deltas).toEqual(['退化成整段'])
  })

  it('流到一半报错时按失败返回，并带上厂商文案', async () => {
    // 真实环境里鉴权与参数错误走 HTTP 状态码，但生成中途出错会以 data 事件下发
    const failure = `data: ${JSON.stringify({ error: { message: '额度不足' } })}\n\n`
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([sse({ content: '开头' }), failure]))
    const result = await requestChat(messages, config, { fetchImpl, onDelta: () => {} })
    expect(result).toMatchObject({ status: 'error', kind: 'network', message: '额度不足' })
  })

  it('错误行没有 data 前缀时也能认出来', async () => {
    const failure = JSON.stringify({ error: { message: '生成中断' } }) + '\n\n'
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([sse({ content: '开头' }), failure]))
    const result = await requestChat(messages, config, { fetchImpl, onDelta: () => {} })
    expect(result).toMatchObject({ status: 'error', message: '生成中断' })
  })

  it('读者中途取消时保留已收到的内容并标记为不完整', async () => {
    const controller = new AbortController()
    const encoder = new TextEncoder()
    // 取消后让挂起的 read() 直接报错，模拟真实 fetch 流被 abort 的行为
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(encoder.encode(sse({ content: '写了一半' })))
      },
      pull() {
        return new Promise<void>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
      },
    })
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body,
    } as unknown as Response
    const fetchImpl = vi.fn().mockResolvedValue(response)
    const pending = requestChat(messages, config, { fetchImpl, signal: controller.signal, onDelta: () => {} })
    await new Promise((r) => setTimeout(r, 20))
    controller.abort()
    const result = await pending
    expect(result).toMatchObject({ content: '写了一半', partial: true })
  })
})
