import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { useEffect } from 'react'
import { isNativeApp, syncNativeBackground } from '../lib/nativeTheme'
import type { Settings } from '../lib/store'

/** 与 styles/index.css 中 --bg 的浅色、深色取值保持一致 */
const NATIVE_BACKGROUND = {
  light: '#f5f2ea',
  dark: '#14150f',
} as const

/** 把主题、字号、字体偏好写到根元素，供 CSS 变量读取 */
export function useAppearance(settings: Settings): void {
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const theme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
      root.dataset.theme = theme
      root.style.colorScheme = theme

      if (!isNativeApp()) return

      // 顺序不能反：SystemBars.setStyle 内部会把窗口底色重置成主题的 windowBackground，
      // 必须先让它设置完，再覆盖成当前应用主题的底色，否则深色主题下会留下一条浅色状态栏。
      SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
        .catch(() => {
          // 旧版 WebView 或浏览器环境没有该插件，忽略即可
        })
        .finally(() => {
          syncNativeBackground(NATIVE_BACKGROUND[theme])
        })
    }

    applyTheme()
    root.style.setProperty('--reading-size', `${settings.fontSize}px`)
    root.dataset.serif = settings.serif ? 'true' : 'false'

    if (settings.theme === 'system') {
      media.addEventListener('change', applyTheme)
      return () => media.removeEventListener('change', applyTheme)
    }
    return undefined
  }, [settings.theme, settings.fontSize, settings.serif])
}
