# Synthetic test media

thumbnail-h264.mp4: one second of project-generated colored shapes, no audio and no third-party material. Covered by the repository MIT license. Generate it on macOS with:

```sh
clang -fobjc-arc -framework Foundation -framework AVFoundation -framework CoreVideo -framework CoreMedia tests/generate-thumbnail-fixture.m -o /tmp/videopocket-fixture
/tmp/videopocket-fixture /tmp/thumbnail-h264.mp4
```

The generator needs access to macOS media encoding services. It will not overwrite an existing output. The preview JPEG is a frame from this clip. Public tests use mocked metadata and do not download third-party videos.
