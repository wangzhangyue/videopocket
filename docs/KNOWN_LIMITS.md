# Known limits

- macOS 13+ and desktop Google Chrome only. Intel component execution has been checked; clean Apple Silicon installation has not.
- Source-only public release. Local development installers are unsigned and unnotarized; binary redistribution review is incomplete.
- Single on-demand video, at most 1080p, no queue, resuming, subtitles or audio-only export. No assurance that any particular site continues working.
- No cookie import, DRM support, authentication or access-control bypass workflow. Platform verification can prevent a public video from being downloaded.
- Source parsing uses upstream extractors including yt-dlp-ejs where applicable; this project has not obtained platform endorsement or a legal clearance for every extractor.
- Closing Chrome interrupts a job; retry starts from the beginning. One Chrome profile can connect per local user.
- File checks inspect container, video/audio streams, height and duration, not every frame. Compatible playback software is required.
- AV1 software decoding is unavailable in the minimal FFmpeg build: video saving may succeed while thumbnail generation fails. Old records do not automatically receive thumbnails.
- Downloads use atomic hard links to avoid overwriting. Some network, external or cloud-backed filesystems may not support this.
- URLs/referrers may contain temporary parameters and remain in local task records. Review logs before sharing.
