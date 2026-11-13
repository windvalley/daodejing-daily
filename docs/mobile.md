# 手机与安装包

本站有两种手机用法：浏览器直接用，或装成应用。装成应用后数据不会再被浏览器按天清理，也不依赖网络。

## 一、安卓 APK

构建产物位于 `android/app/build/outputs/apk/release/app-release.apk`，已导出为 `release/道德经日课-1.2.apk`，直接用数据线或聊天软件传到手机，点击安装即可。

首次安装需要在系统里允许「安装未知来源应用」。这个 APK 用自签名证书签名，不是从应用商店下载，所以系统会提示风险，属于正常现象。

更新版本时保持 `applicationId` 与签名密钥不变，可以直接覆盖安装，本地学习数据保留。版本号在 `android/app/build.gradle` 的 `versionCode`，每次发版必须递增，否则系统会拒绝覆盖安装。

## 二、iPhone

iOS 无法像安卓那样直接装自签名安装包，需要 Apple 开发者账号和 Xcode 才能出 `.ipa`。目前的替代方案是把站点部署到 HTTPS 地址，用 Safari 打开后「添加到主屏幕」，安装后同样可以全屏、离线使用。

## 三、界面如何避让系统栏

应用采用边到边显示：状态栏与手势条透明，网页内容自行留出安全区。

- 顶栏、底栏、正文的留白由 CSS 变量 `--safe-top` / `--safe-bottom` 等控制，值取 `env(safe-area-inset-*)` 与 Capacitor 注入的 `--safe-area-inset-*` 中较大者。
- 状态栏图标颜色跟随应用主题：浅色主题发 `LIGHT`，深色主题发 `DARK`，由 `src/hooks/useAppearance.ts` 调用 `SystemBars.setStyle` 完成。
- 原生窗口底色在 `values/colors.xml` 与 `values-night/colors.xml` 中分别是浅色与深色的网页背景色，避免半透明栏后面透出突兀的颜色。

改动这部分后，请重新执行 `pnpm apk`，并在真机上确认状态栏区域没有内容被遮挡。

## 四、数据在哪

APK 内的学习数据存在应用自己的 WebView 存储空间里，卸载应用会一并删除。换手机前先在「我的」页面导出备份。

浏览器版的数据存在该站点的 localStorage 里，与 APK 不互通。

## 五、本地构建 APK

需要 JDK 21 与 Android SDK（platform 36、build-tools 36）。

```bash
pnpm build
npx cap sync android
cd android
./gradlew assembleRelease
```

签名信息在 `android/keystore/keystore.properties`，密钥文件 `release.jks` 不入库，请自行备份；丢失后无法再对已安装的应用发布更新。
