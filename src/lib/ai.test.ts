import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_STORAGE_KEY,
  EMPTY_AI_CONFIG,
  clearAiConfig,
  isAiConfigured,
  loadAiConfig,
  normalizeEndpoint,
  requestChat,
  sanitizeAiConfig,
  saveAiConfig,
  type AiConfig,
  type ChatMessage,
} from './ai'

const config: AiConfig = {
  endpoint: 'https://example.com/v1/chat/completions',
  model: 'test-model',
  apiKey: 'sk-test',
  economy: false,
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
