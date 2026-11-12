import { useEffect } from 'react'

export function usePageTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · 道德经日课` : '道德经日课 · 学习、背诵与实践'
  }, [title])
}
