import { Capacitor, registerPlugin } from '@capacitor/core'
import { dayKey } from './date'

interface BackupFilePlugin {
  /** 原生端把备份写入系统下载目录，返回用户可读的保存位置 */
  save(options: { fileName: string; content: string }): Promise<{ location?: string }>
}

const BackupFile = registerPlugin<BackupFilePlugin>('BackupFile')

export type BackupSaveResult =
  { status: 'saved'; location: string } | { status: 'started' } | { status: 'failed'; error: string }

/**
 * 备份文件名用本地日期。
 * toISOString 是 UTC，北京时间凌晨导出会写成前一天，与用户看到的日期对不上。
 */
export function backupFileName(now = new Date()): string {
  return `道德经学习备份-${dayKey(now)}.json`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return '未知错误'
}

function startBrowserDownload(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 立即释放会让部分浏览器的下载中断，留到当前任务之后
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 导出备份。
 * 原生端真的写文件，返回保存位置；浏览器只能发起下载，无法确认用户是否保存，
 * 因此返回 started，界面不能提示「已导出」。
 */
export async function saveBackup(content: string, now = new Date()): Promise<BackupSaveResult> {
  const fileName = backupFileName(now)

  if (Capacitor.isNativePlatform()) {
    try {
      const result = await BackupFile.save({ fileName, content })
      return { status: 'saved', location: result.location || fileName }
    } catch (error) {
      return { status: 'failed', error: errorMessage(error) }
    }
  }

  try {
    startBrowserDownload(content, fileName)
    return { status: 'started' }
  } catch (error) {
    return { status: 'failed', error: errorMessage(error) }
  }
}
