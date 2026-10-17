# Validation scope

The public source tree contains offline tests for native message framing and request validation, format choice, path safety, task lifecycle and recovery, cancellation, history, localization, health timeouts and thumbnail size/failure behavior.

The real H.264-to-JPEG test is opt-in with VP_MEDIA_TEST=1 and requires locally built vendor binaries. All other default tests run without network media access. The included media is project-generated. Native messaging integration can be checked on macOS with node tests/native-smoke.mjs after building dependencies.

Passing these tests is not an independent security/legal audit, a guarantee of platform access, or evidence of clean-system Apple Silicon installation and user-study acceptance. Public source releases do not include private test logs or downloaded platform media.
