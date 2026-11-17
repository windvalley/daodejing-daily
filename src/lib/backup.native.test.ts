import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  isNativePlatform: vi.fn(() => true),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: () => ({ save: mocks.save }),
}))

import { saveBackup } from './backup'

beforeEach(() => {
  mocks.save.mockReset()
  mocks.isNativePlatform.mockReturnValue(true)
})

describe('saveBackup（原生）', () => {
  it('调用原生插件并返回实际保存位置', async () => {
    mocks.save.mockResolvedValue({ location: '下载/道德经日课/道德经学习备份-2026-11-17.json' })

    const result = await saveBackup('{"app":"daodejing"}', new Date(2026, 10, 17, 1, 0))

    expect(result).toEqual({ status: 'saved', location: '下载/道德经日课/道德经学习备份-2026-11-17.json' })
    expect(mocks.save).toHaveBeenCalledWith({
      fileName: '道德经学习备份-2026-11-17.json',
      content: '{"app":"daodejing"}',
    })
  })

  it('插件失败时返回可读错误，不假装成功', async () => {
    mocks.save.mockRejectedValue(new Error('无法在下载目录创建文件'))

    expect(await saveBackup('{}')).toEqual({ status: 'failed', error: '无法在下载目录创建文件' })
  })

  it('插件没有返回位置时回退到文件名', async () => {
    mocks.save.mockResolvedValue({})

    expect(await saveBackup('{}', new Date(2026, 10, 17))).toEqual({
      status: 'saved',
      location: '道德经学习备份-2026-11-17.json',
    })
  })
})
