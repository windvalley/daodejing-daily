import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import { actions, createDefaultData } from '../lib/store'

const backupMocks = vi.hoisted(() => ({ saveBackup: vi.fn() }))
const voiceMocks = vi.hoisted(() => ({ voices: [] as unknown[] }))

vi.mock('../lib/backup', () => ({ saveBackup: backupMocks.saveBackup }))

vi.mock('../lib/speechVoice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/speechVoice')>()
  return {
    ...actual,
    loadVoiceOptions: () =>
      Promise.resolve(actual.toVoiceOptions(voiceMocks.voices as Parameters<typeof actual.toVoiceOptions>[0])),
  }
})

// 走真实路由与 Layout，和用户从「我的」进来的路径一致
function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  actions.replaceAll(createDefaultData())
  backupMocks.saveBackup.mockReset()
})

describe('设置页导出备份', () => {
  it('原生保存成功后 toast 只给结论，完整路径写在面板里', async () => {
    backupMocks.saveBackup.mockResolvedValue({
      status: 'saved',
      location: 'Download/道德经日课/道德经学习备份-2026-11-17.json',
    })
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: /导出备份/ }))

    // 窄屏下把长路径塞进 toast 会被挤成好几行，所以路径单独展示
    expect(await screen.findByText('备份已保存到下载目录')).toBeInTheDocument()
    expect(screen.getByText('上次保存位置：Download/道德经日课/道德经学习备份-2026-11-17.json')).toBeInTheDocument()
    const content = backupMocks.saveBackup.mock.calls[0][0] as string
    expect(JSON.parse(content).app).toBe('daodejing')
    expect(JSON.parse(content).data.settings).toBeDefined()
  })

  it('浏览器只发起下载时提示去下载列表确认，不展示保存位置', async () => {
    backupMocks.saveBackup.mockResolvedValue({ status: 'started' })
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: /导出备份/ }))

    expect(await screen.findByText('已开始下载，请到下载列表确认')).toBeInTheDocument()
    expect(screen.queryByText(/上次保存位置|已保存到/)).not.toBeInTheDocument()
  })

  it('保存失败时给出错误而不是成功提示，按钮恢复可用', async () => {
    backupMocks.saveBackup.mockResolvedValue({ status: 'failed', error: '系统下载目录不可用' })
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: /导出备份/ }))

    expect(await screen.findByText('导出失败：系统下载目录不可用')).toBeInTheDocument()
    expect(screen.queryByText(/已开始下载|已保存到|上次保存位置/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出备份/ })).toBeEnabled()
  })

  it('导出期间按钮禁用，重复点击不会再次保存', async () => {
    let resolveSave: (value: { status: 'started' }) => void = () => {}
    backupMocks.saveBackup.mockReturnValue(
      new Promise<{ status: 'started' }>((resolve) => {
        resolveSave = resolve
      }),
    )
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: /导出备份/ }))
    const busyButton = screen.getByRole('button', { name: /正在导出/ })
    expect(busyButton).toBeDisabled()

    await user.click(busyButton)
    expect(backupMocks.saveBackup).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSave({ status: 'started' })
    })
    expect(await screen.findByText('已开始下载，请到下载列表确认')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出备份/ })).toBeEnabled()
  })
})
