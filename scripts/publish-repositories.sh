#!/usr/bin/env bash
# Compatibility entry point. Publishing now uses GitHub only.
set -euo pipefail
exec bash "$(dirname "$0")/publish-github.sh" "$@"
