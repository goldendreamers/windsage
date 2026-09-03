#!/usr/bin/env bash
# Build Cursor Agent Face APK (sideload). Does not print secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
TOOL="$HOME/.local/cursor-face-tools"
SDK="$TOOL/android-sdk"
JDK="$TOOL/jdk-17"
GRADLE_VER="8.9"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export JAVA_HOME="$JDK"
export PATH="$JDK/bin:$SDK/cmdline-tools/latest/bin:$PATH"

mkdir -p "$TOOL" "$SDK"

if [[ ! -x "$JDK/bin/java" ]]; then
  echo "Downloading Temurin 17…"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/jdk17.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
  mkdir -p "$tmp/out"
  tar -xzf "$tmp/jdk17.tar.gz" -C "$tmp/out"
  inner="$(find "$tmp/out" -maxdepth 2 -type d -name 'Contents' | head -1)"
  if [[ -n "$inner" ]]; then
    mkdir -p "$JDK"
    rsync -a "$inner/Home/" "$JDK/"
  else
    found="$(find "$tmp/out" -maxdepth 1 -type d -name 'jdk-17*' | head -1)"
    rsync -a "$found/" "$JDK/"
  fi
  rm -rf "$tmp"
fi

if [[ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]]; then
  echo "Downloading Android command-line tools…"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/cmd.zip" \
    "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
  unzip -q "$tmp/cmd.zip" -d "$tmp"
  mkdir -p "$SDK/cmdline-tools/latest"
  rsync -a "$tmp/cmdline-tools/" "$SDK/cmdline-tools/latest/"
  rm -rf "$tmp"
fi

mkdir -p "$SDK/licenses"
printf '24333f8a63b6825ea9c5514f83c2829b004d1fee\n' > "$SDK/licenses/android-sdk-license"
printf '84831b9409646161ce1b7ce3db2179b39\n' > "$SDK/licenses/android-sdk-preview-license"
sdkmanager --sdk_root="$SDK" \
  "platform-tools" \
  "platforms;android-34" \
  "build-tools;34.0.0"

if [[ ! -x "$TOOL/gradle-$GRADLE_VER/bin/gradle" ]]; then
  echo "Downloading Gradle $GRADLE_VER…"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/gradle.zip" \
    "https://services.gradle.org/distributions/gradle-${GRADLE_VER}-bin.zip"
  unzip -q "$tmp/gradle.zip" -d "$TOOL"
  rm -rf "$tmp"
fi

python3 "$ROOT/scripts/make-icons.py"
printf 'sdk.dir=%s\n' "$SDK" > "$ROOT/local.properties"

"$TOOL/gradle-$GRADLE_VER/bin/gradle" -p "$ROOT" --no-daemon assembleRelease

apk="$(find "$ROOT/app/build/outputs/apk/release" -name '*.apk' | head -1)"
if [[ -z "$apk" ]]; then
  echo "APK missing" >&2
  exit 1
fi
dest="$REPO/public/cursor-face/cursor-agent-face.apk"
mkdir -p "$(dirname "$dest")"
cp "$apk" "$dest"
echo "APK $dest"
ls -lh "$dest"
