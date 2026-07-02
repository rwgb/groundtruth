#!/usr/bin/env bash
# Groundtruth status-line — version-agnostic wrapper.
# The plugin lives in a per-VERSION cache dir (…/groundtruth/<version>/hooks/…), so pinning that path in
# settings.local.json breaks the badge on every plugin update. `/groundtruth-setup` deploys THIS file to a
# stable path (~/.claude/groundtruth-statusline.sh) and points "statusLine".command at it: it resolves the
# NEWEST installed version at runtime and runs its statusline.
# Fails OPEN — no install / no node / any error → prints nothing (badge simply absent), never errors the UI.
cache="$HOME/.claude/plugins/cache/groundtruth/groundtruth"
latest=$(ls -1 "$cache" 2>/dev/null | sort -V | while read -r d; do
  [ -f "$cache/$d/hooks/groundtruth-statusline.mjs" ] && echo "$d"
done | tail -1)
[ -n "$latest" ] && node "$cache/$latest/hooks/groundtruth-statusline.mjs" 2>/dev/null
exit 0
