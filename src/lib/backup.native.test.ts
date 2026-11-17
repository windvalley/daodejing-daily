import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const save = vi.fn()
  const registerPlugin = vi.fn((_name: string) => ({ save }))
  const isNativePlatform = vi.fn(() => true)
  return { save, registerPlugin, isNativePlatform }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: mocks.registerPlugin,
}))

import { saveBackup } from './backup'

// 插件在模块加载时注册，而 vitest 的 restoreMocks 会在每个用例前清空调用记录，
// 所以要在导入后立刻快照，否则断言永远看到 0 次调用。
const registeredPluginNames = mocks.registerPlugin.mock.calls.map((call) => call[0])

beforeEach(() => {
  mocks.save.mockReset()
  mocks.isNativePlatform.mockReturnValue(true)
})

describe('saveBackup（原生）', () => {
  it('按原生插件的注册名注册 BackupFile', () => {
    // 名字必须和 BackupFilePlugin.java 的 @CapacitorPlugin(name = "BackupFile") 一致，
    // 插件名写错只有真机点导出才会暴露，单测要能拦住
    expect(registeredPluginNames).toEqual(['BackupFile'])
  })

  it('调用原生插件并返回实际保存位置', async () => {
    mocks.save.mockResolvedValue({ location: 'Download/道德经日课/道德经学习备份-2026-11-17.json' })

    const result = await saveBackup('{"app":"daodejing"}', new Date(2026, 10, 17, 1, 0))

    expect(result).toEqual({ status: 'saved', location: 'Download/道德经日课/道德经学习备份-2026-11-17.json' })
    expect(mocks.save).toHaveBeenCalledWith({
      fileName: '道德经学习备份-2026-11-17.json',
      content: '{"app":"daodejing"}',
    })
  })

  it('插件失败时返回可读错误，不假装成功', async () => {
    mocks.save.mockRejectedValue(new Error('系统下载目录不可用'))

    expect(await saveBackup('{}')).toEqual({ status: 'failed', error: '系统下载目录不可用' })
  })

  it('插件没有返回位置时回退到文件名', async () => {
    mocks.save.mockResolvedValue({})

    expect(await saveBackup('{}', new Date(2026, 10, 17))).toEqual({
      status: 'saved',
      location: '道德经学习备份-2026-11-17.json',
    })
  })
})
