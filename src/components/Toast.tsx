import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastFn } from './toast-context'

interface ToastItem {
  id: number
  message: string
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const show = useCallback<ToastFn>((message) => {
    counter.current += 1
    const id = counter.current
    setItems((current) => [...current, { id, message }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 2600)
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div className="toast" key={item.id}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
