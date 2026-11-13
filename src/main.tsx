import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ToastProvider } from './components/Toast'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到应用挂载节点')

/**
 * 只在浏览器里注册 Service Worker。
 * APK 内的资源随包发布，再叠一层缓存只会在升级后读到旧文件。
 */
const isNative = Boolean(
  (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
)

if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNative) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch((error) => {
      console.warn('离线缓存注册失败，不影响阅读', error)
    })
  })
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
