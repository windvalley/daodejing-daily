# 手机与安装包

本站有两种手机用法：浏览器直接用，或装成应用。装成应用后数据不会再被浏览器按天清理，也不依赖网络。

## 一、安卓 APK

构建产物位于 `android/app/build/outputs/apk/release/app-release.apk`，已导出为 `release/道德经日课-1.4.0.apk`，直接用数据线或聊天软件传到手机，点击安装即可。

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

本机已配好两个可直接跑的安卓模拟器，用来验证边到边布局、主题切换、完整学习流程与朗读。
仓库里没有 iOS 原生工程（`ios/` 目录与 `@capacitor/ios` 都没有装），模拟器只有安卓一侧。

- `ddj-phone` 用 `default` 镜像，启动快，适合看布局和流程，但没有语音引擎。
- `ddj-phone-tts` 用 `google_apis` 镜像，自带 Google 语音引擎，验证朗读必须用它。

环境：

- JDK 21 在 `~/.local/jdk/` 下的某个 `jdk-21.*/Contents/Home`，不要把小版本号写死到命令里
- Android SDK 在 `~/.local/android-sdk`（platform 36、build-tools 36、emulator、系统镜像 `android-36;default;arm64-v8a` 与 `android-36;google_apis;arm64-v8a`）
- 两个 AVD 都是 Pixel 7 规格，分辨率 1080x2400，密度 420

`default` 镜像没有语音引擎，点「朗读」只会得到 `Not yet initialized or not available on this device.`，随后按钮恢复原状，应用不会崩溃。
这是镜像缺少能力，不是应用问题，换 `ddj-phone-tts` 就能正常朗读。

启动与安装（`-avd` 后面换成要用的 AVD 名）：

```bash
export ANDROID_HOME=$HOME/.local/android-sdk
export PATH="$ANDROID_HOME/platform-tools:$PATH"

$ANDROID_HOME/emulator/emulator -avd ddj-phone-tts -no-snapshot -no-boot-anim -gpu swiftshader_indirect -no-audio &
adb wait-for-device
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.daodejing.daily/.MainActivity
```

模拟器与 adb 都是原生可执行文件，启动这一步不需要 JDK。
只有打 APK 才需要 JDK 21，`scripts/build-apk.sh` 会自己在 `~/.local/jdk/` 下找，不必手工导出 `JAVA_HOME`。

### 改样式时不必每次打 APK

APK 里加载的是打包进去的 `dist`，改源码不会自动生效。只想看页面渲染时，让电脑上的开发服务器直接对模拟器开放：

```bash
pnpm dev
adb shell am start -a android.intent.action.VIEW -d "http://10.0.2.2:5173/"
```

`10.0.2.2` 是模拟器指向宿主机回环地址的固定别名，等价于宿主机的 `127.0.0.1`。
所以 `pnpm dev` 不带 `--host` 也能被模拟器访问，不需要换成 `pnpm dev:lan`，也不用去查局域网 IP。
模拟器内置 Chrome 首次打开会有几步引导（登录、通知），点「Use without an account」和「No thanks」跳过后就能看到页面。
端口按 Vite 默认的 5173 算，本机 5173 被占用时 Vite 会顺延到下一个端口，地址里要改成实际打印的那个。

这条路只能验证网页本身：页面跑在 Chrome 里，不是 Capacitor，所以既没有 Capacitor 注入的 `--safe-area-inset-*`，也没有状态栏配色、原生导出插件与朗读插件。
`--safe-top` 这类变量在浏览器里只剩 `env(safe-area-inset-*)` 一项来源，避让结果和装成 APK 后不一致。
边到边布局、状态栏条带底色、导出落盘、朗读仍然必须装 APK 在 `ddj-phone-tts` 上验。

### 验证朗读

1. 进入任意章节，点「朗读」，按钮应变成「停止」，读完自动变回「朗读」。
2. 朗读期间再点一次「停止」，应立刻停下并恢复按钮。
3. 在设置里把朗读音色切到「低沉」「明亮」再试听，同一系统音色下应能听出音高差异。
4. 看日志确认请求确实交给了系统语音引擎：

```bash
adb logcat -s GoogleTTSServiceImpl:I
```

出现 `Synthesis request for locale zho-CHN` 与 `TTS dispatch: cmn-cn-...` 即说明引擎已接单。
启动命令带 `-no-audio` 时宿主机听不到声音，但合成链路照常执行；想听声音去掉 `-no-audio`。
首次朗读中文时引擎会联网拉取语音包，日志里是 `Requesting download of URL https://dl.google.com/android/tts/...`，保持联网稍等即可。

换机器需要重建 AVD 时：

```bash
sdkmanager "system-images;android-36;google_apis;arm64-v8a"
avdmanager create avd -n ddj-phone-tts -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_7
```

WebView 调试：

```bash
PID=$(adb shell pidof com.daodejing.daily | tr -d '
')
adb forward tcp:9333 localabstract:webview_devtools_remote_$PID
# 之后可用 Puppeteer 连 http://127.0.0.1:9333
```

已知限制：

- 模拟器启动后约 20 秒完成开机，截屏前建议等待数秒，否则可能拍到未渲染完成的空白页。

## 五、数据在哪

APK 内的学习数据存在应用自己的 WebView 存储空间里，卸载应用会一并删除。换手机前先在「我的」页面导出备份。

导出备份会写入系统下载目录的「道德经日课」文件夹（Android 10 及以上，不需要存储权限），这个位置在卸载应用后仍然保留。Android 9 及以下写入应用文件目录 `Android/data/com.daodejing.daily/files/Download/道德经日课`，该目录会随卸载删除，换机前要先把文件复制到电脑或其他目录。文件名使用导出当天的本地日期，同名文件不会覆盖，系统会追加 `(1)`、`(2)` 这样的序号。

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
