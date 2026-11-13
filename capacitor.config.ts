import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 原生壳配置：WebView 直接加载打包进 APK 的 dist，离线可用、不需要任何服务器。
 * 注意 appId 一旦用于签名与上架就不能随意改动。
 */
const config: CapacitorConfig = {
  appId: 'com.daodejing.daily',
  appName: '道德经日课',
  webDir: 'dist',
  android: {
    // 允许 WebView 使用本地 https 源，行为更接近正式站点
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SystemBars: {
      // 走 CSS 变量模式：由 Web 侧读取安全区自行避让，横竖屏都能精确对齐
      insetsHandling: 'css',
      // 页面本来就带 viewport-fit=cover，提前声明可避免首屏跳动
      initialViewportFitValueHint: 'cover',
      style: 'DEFAULT',
    },
  },
}

export default config
