#!/usr/bin/env bash
# Send a push notification to the ntfy topic in $NTFY_TOPIC.
#
#   scripts/notify.sh <title> <message> [priority] [tags] [click-url]
#
#   priority  min|low|default|high|urgent (or 1-5). Default: default
#   tags      comma-separated ntfy tags; emoji short codes become icons
#             (e.g. "warning,iphone"). Default: none
#   click-url opened when the notification is tapped. Default: none
#
# Optional env:
#   NTFY_TOPIC    topic name (required; without it this script only logs)
#   NTFY_SERVER   default https://ntfy.sh
#   NTFY_TOKEN    access token, if the topic is ever moved behind auth
#   NTFY_ACTIONS  extra buttons, ntfy short format, up to 3, e.g.
#                 "view, Play Console, https://play.google.com/console; view, Logs, https://..."
#   NTFY_STRICT=1 exit non-zero when delivery fails (default: warn and exit 0,
#                 so a notification outage never fails a release)
#
# Note: topics on ntfy.sh are public to anyone who knows the name. Never put
# secrets or signed download URLs in a message.
set -uo pipefail

title="${1:?usage: notify.sh <title> <message> [priority] [tags] [click-url]}"
message="${2:?usage: notify.sh <title> <message> [priority] [tags] [click-url]}"
priority="${3:-default}"
tags="${4:-}"
click="${5:-}"

server="${NTFY_SERVER:-https://ntfy.sh}"
topic="${NTFY_TOPIC:-}"

# Always echo to the job log (and the GitHub step summary when available).
echo "[notify] (${priority}) ${title}: ${message}${click:+ -> ${click}}"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf -- '- **%s** (%s): %s\n' "$title" "$priority" "${message//$'\n'/ }" >>"$GITHUB_STEP_SUMMARY" || true
fi

if [[ -z "$topic" ]]; then
  echo "[notify] NTFY_TOPIC is not set; skipping push." >&2
  exit 0
fi

# HTTP headers are safest as ASCII: wrap a non-ASCII title as an RFC 2047
# encoded-word, which ntfy decodes.
if LC_ALL=C grep -q '[^ -~]' <<<"$title"; then
  title="=?UTF-8?B?$(printf '%s' "$title" | base64 | tr -d '\n')?="
fi

args=(-sS --max-time 15 --retry 3 --retry-delay 2 -o /dev/null -w '%{http_code}'
  -H "Title: ${title}"
  -H "Priority: ${priority}")
[[ -n "$tags" ]] && args+=(-H "Tags: ${tags}")
[[ -n "$click" ]] && args+=(-H "Click: ${click}")
[[ -n "${NTFY_ACTIONS:-}" ]] && args+=(-H "Actions: ${NTFY_ACTIONS}")
[[ -n "${NTFY_TOKEN:-}" ]] && args+=(-H "Authorization: Bearer ${NTFY_TOKEN}")

code="$(printf '%s' "$message" | curl "${args[@]}" --data-binary @- "${server%/}/${topic}")"
status=$?
if [[ $status -ne 0 || "$code" != 2* ]]; then
  echo "::warning::ntfy delivery failed (curl exit ${status}, HTTP ${code:-none})" >&2
  [[ "${NTFY_STRICT:-0}" == "1" ]] && exit 1
fi
exit 0
