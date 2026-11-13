import { registerPlugin } from '@capacitor/core'

interface ThemeBackgroundPlugin {
  /** 同步原生窗口底色，避免状态栏条带与应用主题不一致 */
  setBackground(options: { color: string }): Promise<{ color: string }>
}

const ThemeBackground = registerPlugin<ThemeBackgroundPlugin>('ThemeBackground')

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return Boolean(capacitor?.isNativePlatform?.())
}

/** 把网页当前主题的背景色写到原生窗口，供系统栏条带使用 */
export function syncNativeBackground(color: string): void {
  if (!isNativeApp()) return
  ThemeBackground.setBackground({ color }).catch(() => {
    // 旧版本安装包没有这个插件，忽略即可
  })
}
