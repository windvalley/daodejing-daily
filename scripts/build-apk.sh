#!/usr/bin/env bash
# 一键构建可安装的安卓 APK。
# 需要 JDK 21 与 Android SDK；若没有全局配置，会依次尝试常见安装位置。
set -euo pipefail

cd "$(dirname "$0")/.."

find_jdk() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    echo "${JAVA_HOME}"
    return
  fi
  if /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
    /usr/libexec/java_home -v 21
    return
  fi
  local candidate
  for candidate in "$HOME"/.local/jdk/*/Contents/Home "$HOME"/.local/jdk/*; do
    if [[ -x "${candidate}/bin/java" ]]; then
      echo "${candidate}"
      return
    fi
  done
  return 1
}

JDK_HOME="$(find_jdk)" || {
  echo "找不到 JDK 21。请安装后重试，或设置 JAVA_HOME。" >&2
  exit 1
}

ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/.local/android-sdk}}"
if [[ ! -d "${ANDROID_SDK}/platforms" ]]; then
  echo "找不到 Android SDK：${ANDROID_SDK}" >&2
  echo "请安装 Android SDK，或设置 ANDROID_HOME。" >&2
  exit 1
fi

export JAVA_HOME="${JDK_HOME}"
export ANDROID_HOME="${ANDROID_SDK}"
export ANDROID_SDK_ROOT="${ANDROID_SDK}"
export PATH="${JAVA_HOME}/bin:${PATH}"

echo "JDK:      ${JAVA_HOME}"
echo "SDK:      ${ANDROID_SDK}"

echo "==> 构建网页资源"
pnpm build

echo "==> 同步到原生工程"
npx cap sync android

echo "==> 打包 APK"
echo "sdk.dir=${ANDROID_SDK}" > android/local.properties
(cd android && ./gradlew assembleRelease --no-daemon -q)

APK="android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "${APK}" ]]; then
  echo "构建结束但没有找到 APK" >&2
  exit 1
fi

echo "==> 完成：${APK}"
ls -lh "${APK}"
