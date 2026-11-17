import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backupFileName, saveBackup } from './backup'

describe('backupFileName', () => {
  it('使用本地日期而不是 UTC 日期', () => {
    // 本地 0:30 在 UTC 还是前一天，文件名必须跟本地看到的一致
    expect(backupFileName(new Date(2026, 10, 17, 0, 30))).toBe('道德经学习备份-2026-11-17.json')
    expect(backupFileName(new Date(2026, 0, 1, 23, 59))).toBe('道德经学习备份-2026-01-01.json')
  })
})

describe('saveBackup（浏览器）', () => {
  let blobs: Blob[] = []
  let clicks: { href: string; download: string }[] = []

  beforeEach(() => {
    blobs = []
    clicks = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
      blobs.push(object as Blob)
      return 'blob:backup'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute('href') ?? '', download: this.getAttribute('download') ?? '' })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('生成 JSON 下载并返回 started', async () => {
    const result = await saveBackup('{"app":"daodejing"}', new Date(2026, 10, 17, 9, 0))

    expect(result).toEqual({ status: 'started' })
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('application/json')
    expect(await blobs[0].text()).toBe('{"app":"daodejing"}')
    expect(clicks).toEqual([{ href: 'blob:backup', download: '道德经学习备份-2026-11-17.json' }])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })

  it('下载链接留到下一个任务再释放', async () => {
    vi.useFakeTimers()
    await saveBackup('{}')

    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })

  it('浏览器拒绝创建下载时返回失败', async () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error('下载被拦截')
    })

    expect(await saveBackup('{}')).toEqual({ status: 'failed', error: '下载被拦截' })
  })
})
