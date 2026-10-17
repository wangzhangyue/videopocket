#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor/downloads vendor/licenses vendor/src
fetch() { if [ ! -s "$2" ]; then curl --fail --location --retry 2 --connect-timeout 20 --max-time 300 "$1" -o "$2.part"; mv "$2.part" "$2"; fi; }
node_version=v22.23.3
ytdlp_version=2026.08.19
fetch "https://nodejs.org/dist/$node_version/SHASUMS256.txt" vendor/downloads/node-SHASUMS256.txt
fetch "https://github.com/yt-dlp/yt-dlp/releases/download/$ytdlp_version/SHA2-256SUMS" vendor/downloads/ytdlp-SHA2-256SUMS
fetch "https://github.com/yt-dlp/yt-dlp/releases/download/$ytdlp_version/yt-dlp_macos.zip" vendor/downloads/yt-dlp_macos.zip
(cd vendor/downloads; awk '$2 == "yt-dlp_macos.zip"' ytdlp-SHA2-256SUMS | shasum -a 256 -c -)
mkdir -p vendor/ytdlp-unpacked
unzip -oq vendor/downloads/yt-dlp_macos.zip -d vendor/ytdlp-unpacked
for arch in arm64 x64; do
  mkdir -p "vendor/$arch"
  archive="node-$node_version-darwin-$arch.tar.gz"
  fetch "https://nodejs.org/dist/$node_version/$archive" "vendor/downloads/$archive"
  (cd vendor/downloads; awk -v name="$archive" '$2 == name' node-SHASUMS256.txt | shasum -a 256 -c -)
  tar -xzf "vendor/downloads/$archive" -C vendor/downloads "node-$node_version-darwin-$arch/bin/node" "node-$node_version-darwin-$arch/LICENSE"
  cp "vendor/downloads/node-$node_version-darwin-$arch/bin/node" "vendor/$arch/node"
  cp vendor/ytdlp-unpacked/yt-dlp_macos "vendor/$arch/yt-dlp"
  rm -rf "vendor/$arch/_internal"
  cp -R vendor/ytdlp-unpacked/_internal "vendor/$arch/"
  cp "vendor/downloads/node-$node_version-darwin-$arch/LICENSE" vendor/licenses/Node-LICENSE.txt
  chmod 755 "vendor/$arch/node" "vendor/$arch/yt-dlp"
done
fetch "https://raw.githubusercontent.com/yt-dlp/yt-dlp/$ytdlp_version/THIRD_PARTY_LICENSES.txt" vendor/licenses/yt-dlp-THIRD_PARTY_LICENSES.txt
fetch "https://raw.githubusercontent.com/yt-dlp/yt-dlp/$ytdlp_version/LICENSE" vendor/licenses/yt-dlp-LICENSE.txt
fetch "https://github.com/yt-dlp/yt-dlp/releases/download/$ytdlp_version/yt-dlp.tar.gz" vendor/src/yt-dlp-2026.08.19.tar.gz
fetch "https://ffmpeg.org/releases/ffmpeg-8.0.1.tar.xz" vendor/src/ffmpeg-8.0.1.tar.xz
