#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/ffmpeg vendor/licenses
if [ ! -d build/ffmpeg/ffmpeg-8.0.1 ]; then tar -xf vendor/src/ffmpeg-8.0.1.tar.xz -C build/ffmpeg; fi
cp build/ffmpeg/ffmpeg-8.0.1/COPYING.LGPLv2.1 vendor/licenses/FFmpeg-LGPL-2.1.txt
sdk="$(xcrun --show-sdk-path)"
arches=("$@")
if [ ${#arches[@]} -eq 0 ]; then arches=(arm64 x64); fi
for arch in "${arches[@]}"; do
  case "$arch" in arm64|x64) ;; *) echo "Expected arm64 or x64" >&2; exit 1 ;; esac
  target=arm64; ffarch=aarch64
  if [ "$arch" = x64 ]; then target=x86_64; ffarch=x86_64; fi
  mkdir -p "build/ffmpeg/$arch" "vendor/$arch"
  (
    cd "build/ffmpeg/$arch"
    ../ffmpeg-8.0.1/configure --cc=clang --arch="$ffarch" --target-os=darwin --enable-cross-compile \
      --sysroot="$sdk" --extra-cflags="-arch $target -mmacosx-version-min=13.0" \
      --extra-ldflags="-arch $target -mmacosx-version-min=13.0" \
      --disable-everything --disable-autodetect --disable-doc --disable-network --disable-debug --disable-asm \
      --disable-shared --enable-static --enable-ffmpeg --enable-ffprobe \
      --enable-protocol=file --enable-demuxer=mov,matroska,aac,mpegts \
      --enable-muxer=mp4,webm,image2 --enable-encoder=mjpeg --enable-filter=scale --enable-parser=h264,hevc,av1,vp8,vp9,aac,opus,vorbis \
      --enable-decoder=h264,hevc,av1,vp8,vp9,aac,opus,vorbis \
      --enable-bsf=aac_adtstoasc,extract_extradata,vp9_superframe
    make -j4
  )
  cp "build/ffmpeg/$arch/ffmpeg" "build/ffmpeg/$arch/ffprobe" "vendor/$arch/"
done
