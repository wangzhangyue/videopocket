# Architecture

Chrome popup → extension service worker → Native Messaging host → isolated worker → yt-dlp / FFmpeg / FFprobe → local files.

The service worker owns the native connection, so closing the popup does not stop a download. No production HTTP service, page-scanning script or product relay is used. The preview server is development-only and uses simulated browser APIs.

The helper is the authoritative state owner. It persists state atomically in ~/Library/Application Support/VideoPocket/state.json; Chrome storage caches a snapshot. Requests are allowlisted and validate extension origin, types and fields. Media commands use argument arrays, not interpolated shell commands. Native calls do not accept arbitrary executable names or output paths.

Downloads use isolated task directories. After stream verification, the helper publishes without overwriting an existing file; directory and file identities are checked. Cancel and disconnect terminate the worker process group. Recovery handles interrupted tasks and incomplete publication.

JPEG thumbnails are extracted locally, capped at 24 KB and 320×180, and stored in task records. A 10-second thumbnail failure does not turn a valid video into a failed download. The recent list holds 20 entries. Playback and reveal accept a task ID and validate the recorded file before calling the system application launcher.

Permissions: activeTab, storage, nativeMessaging. Native commands: hello, snapshot, parse, download, cancel, retry, chooseDirectory, reveal, play, clearHistory.

See PRIVACY.md and THIRD_PARTY_NOTICES.md for data and dependency boundaries. Source references: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging and https://github.com/yt-dlp/yt-dlp .
