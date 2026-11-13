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
- 状态栏与导航栏那一条带由原生窗口绘制，网页管不到。旧版 WebView（低于 140）下 Capacitor 用原生 padding 让出系统栏，条带显示的就是窗口底色，因此 `android/.../ThemeBackgroundPlugin.java` 提供 `ThemeBackground.setBackground`，在主题切换时把原生窗口底色改成当前应用背景色。
- 调用顺序不能反：`SystemBars.setStyle` 内部会把窗口底色重置成主题的 `windowBackground`，必须先调用它，再覆盖底色。顺序颠倒会出现深色主题下残留一条浅色状态栏。
- 原生窗口底色在 `values/colors.xml` 与 `values-night/colors.xml` 中分别是浅色与深色的网页背景色，避免半透明栏后面透出突兀的颜色。

改动这部分后，请重新执行 `pnpm apk`，并在真机上确认状态栏区域没有内容被遮挡。

## 四、真机模拟器测试

本机已配好可直接跑的安卓模拟器，用来验证边到边布局、主题切换与完整学习流程。

环境：

- JDK 21 在 `~/.local/jdk/jdk-21.0.13+9/Contents/Home`
- Android SDK 在 `~/.local/android-sdk`（platform 36、build-tools 36、emulator、系统镜像 `android-36;default;arm64-v8a`）
- AVD 名为 `ddj-phone`，规格 Pixel 7，分辨率 1080x2400，密度 420

启动与安装：

```bash
export ANDROID_HOME=$HOME/.local/android-sdk
export PATH="$HOME/.local/jdk/jdk-21.0.13+9/Contents/Home/bin:$ANDROID_HOME/platform-tools:$PATH"

$ANDROID_HOME/emulator/emulator -avd ddj-phone -no-snapshot -no-boot-anim -gpu swiftshader_indirect -no-audio &
adb wait-for-device
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.daodejing.daily/.MainActivity
```

WebView 调试：

```bash
PID=$(adb shell pidof com.daodejing.daily | tr -d '
')
adb forward tcp:9333 localabstract:webview_devtools_remote_$PID
# 之后可用 Puppeteer 连 http://127.0.0.1:9333
```

已知限制：

- `default` 镜像不含语音引擎，点「朗读」会得到 `Not yet initialized or not available on this device.`，应用做了兜底不会崩溃。要测朗读需换带 TTS 的镜像或真机。
- 模拟器启动后约 20 秒完成开机，截屏前建议等待数秒，否则可能拍到未渲染完成的空白页。

## 五、数据在哪

APK 内的学习数据存在应用自己的 WebView 存储空间里，卸载应用会一并删除。换手机前先在「我的」页面导出备份。

浏览器版的数据存在该站点的 localStorage 里，与 APK 不互通。

## 六、本地构建 APK

需要 JDK 21 与 Android SDK（platform 36、build-tools 36）。

```bash
pnpm build
npx cap sync android
cd android
./gradlew assembleRelease
```

签名信息在 `android/keystore/keystore.properties`，密钥文件 `release.jks` 不入库，请自行备份；丢失后无法再对已安装的应用发布更新。
