#!/bin/sh
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec /usr/bin/env -i HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" PATH=/usr/bin:/bin "$ROOT/bin/node" "$ROOT/host.mjs" "$@"
