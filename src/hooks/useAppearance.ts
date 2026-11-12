import { useEffect } from 'react'
import type { Settings } from '../lib/store'

/** 把主题、字号、字体偏好写到根元素，供 CSS 变量读取 */
export function useAppearance(settings: Settings): void {
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const theme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
      root.dataset.theme = theme
      root.style.colorScheme = theme
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
