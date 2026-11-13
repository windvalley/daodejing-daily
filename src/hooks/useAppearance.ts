import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { useEffect } from 'react'
import type { Settings } from '../lib/store'

const isNative = () =>
  typeof window !== 'undefined' &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())

/** 把主题、字号、字体偏好写到根元素，供 CSS 变量读取 */
export function useAppearance(settings: Settings): void {
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const theme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
      root.dataset.theme = theme
      root.style.colorScheme = theme

      // 原生壳里同步系统栏图标颜色，避免深色主题下仍是深色图标
      if (isNative()) {
        SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {
          // 旧版本 WebView 或浏览器环境没有该插件，忽略即可
        })
      }
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
