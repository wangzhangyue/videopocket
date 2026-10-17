# Source release checklist

- Review public-files.json explicitly before adding any file; packaging copies only this list.
- Run npm test, npm run check and npm run audit:public from the clean public tree.
- Keep only project-generated media. Check screenshots, binaries and embedded data separately.
- Do not commit vendor/, build/, dist/, downloaded videos, task state, personal paths, logs, keys or signed URLs.
- Check MIT scope and third-party notices; do not describe this as legal certification.
- Do not upload a binary installer until its full dependency/source delivery review is complete.
- Inspect the resulting archive. Automated pattern checks are only a supplement to human review.
- Before git push, compare git ls-files to public-files.json; .gitignore alone is not sufficient.
- Keep platform-support claims accurate; do not promise every playable video is downloadable.
