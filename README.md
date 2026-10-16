# 拾影 · VideoPocket

A local-first Chrome extension for saving videos you own or are authorized to download.

面向 macOS 的视频保存工具：Chrome 插件通过 Native Messaging 连接本地助手，使用 yt-dlp、FFmpeg 和 FFprobe 解析、保存与校验视频。

**本仓库仅发布源码，不提供预编译安装包。** 集成安装包的第三方再分发许可审查尚未完成。构建脚本供开发者本地构建与检查，不代表已批准对外分发其产物。

## 功能与范围

- 中文 / English 切换；当前页链接或手动输入 HTTP(S) 链接。
- 单个点播视频，最高 1080p；选择 MP4 或 WebM 兼容音视频组合，不转码视频。
- 分阶段进度、取消、从头重试、目录设置与文件定位。
- 最近 20 条本地记录；本地缩略图、时长角标、调用默认播放器。
- 不读取浏览器 Cookie，不提供登录态导入、页面扫描、批量下载或视频中转服务。
- DRM、付费访问、需要登录或平台验证的内容不在支持范围内；不保证任意网站或任意可播放视频都能下载。

仅在拥有必要权利及授权、并符合适用法律和平台条款的情况下使用。公开可播放不等于允许下载或再传播。项目不声称与 YouTube、X、Google 或其他平台存在合作或认可关系。使用说明不扩大也不限制 LICENSE 所授予的软件版权许可。

## 开发与预览

需要 Node.js 22+。无 npm 第三方依赖。普通检查不联网下载视频，也不要求安装助手。

```sh
npm test
npm run check
npm run audit:public
node tests/preview-server.mjs 4173
```

打开 http://127.0.0.1:4173/?scenario=completed 查看模拟界面。预览不会下载视频或实际启动播放器。界面图片来自项目自制测试片段，不包含第三方视频画面。

## 本地构建 macOS 助手

目标为 macOS 13+、正式版 Google Chrome。构建需要 macOS Command Line Tools；安装这些工具请遵循 Apple 官方流程。以下脚本从官方上游下载构建依赖，请先阅读 [第三方说明](THIRD_PARTY_NOTICES.md)。

```sh
bash scripts/fetch-vendor.sh
bash scripts/build-ffmpeg.sh x64  # Intel；Apple Silicon 改为 arm64
node scripts/build.mjs x64      # 与芯片匹配
VP_MEDIA_TEST=1 node --test tests/thumbnail.test.mjs
```

脚本会生成本地开发安装包。完成依赖许可审核前，不要把这些产物当作本项目的公开 Release。自行安装时，在 Chrome 的 chrome://extensions 开启开发者模式，加载 extension 目录；随后运行与芯片匹配的本地构建 .pkg。包未签名、未公证；不要关闭系统安全保护。构建和安装尚未在干净的 Apple Silicon 系统验收。

原生 host 校验扩展身份，manifest 中的 key 是公开扩展身份公钥，不是秘密或凭据。保留它可与当前 helper/config.json 配对；更改扩展身份必须同时修改两端配置。

卸载时退出 Chrome，运行本地构建包内的卸载助手，再移除扩展。默认保留视频与助手记录；清理方式见 [隐私说明](PRIVACY.md)。

## 限制与验证

退出浏览器会中断任务；没有排队或断点续传。缩略图生成失败不会改变成功的视频下载状态；当前精简组件不支持 AV1 软件解码。缺失的媒体文件不能定位或播放。更多内容见 [已知限制](docs/KNOWN_LIMITS.md) 和 [验证记录](docs/VALIDATION.md)。

## 许可与反馈

自有源码、文档、图标及自制测试素材采用 [MIT](LICENSE)。未随本仓库提供的第三方组件适用各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

使用问题可提交 Issue，但不要上传未经授权的视频、Cookie、签名链接或未脱敏日志。安全问题见 [SECURITY.md](SECURITY.md)，贡献与版权反馈见 [CONTRIBUTING.md](CONTRIBUTING.md)。
