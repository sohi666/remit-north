#!/usr/bin/env bash
# CI helper: write store credentials from env secrets to private temp files,
# mask them in the log and export their paths through $GITHUB_ENV.
#
#   scripts/ci/write-secrets.sh <ios|ios-build|android|all>
#
#   ios        ASC_KEY_P8 -> $ASC_API_KEY_PATH (used by eas submit, fastlane)
#   ios-build  same, plus EXPO_ASC_* / EXPO_APPLE_TEAM_* so `eas build` can repair
#              provisioning profiles in non-interactive mode. Only exported when
#              the APPLE_TEAM_ID repository variable is set (otherwise eas-cli
#              would try to prompt for the team and fail).
#   android    GOOGLE_SERVICE_ACCOUNT_JSON -> $GOOGLE_SERVICE_ACCOUNT_KEY_PATH
#
# Files go to $RUNNER_TEMP/app-secrets (outside the repo, wiped after the job).
# Remove them explicitly with: scripts/ci/write-secrets.sh cleanup
set -euo pipefail

mode="${1:-all}"
dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/app-secrets"

if [[ "$mode" == "cleanup" ]]; then
  rm -rf "$dir"
  exit 0
fi

umask 077
mkdir -p "$dir"

export_env() {
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf '%s=%s\n' "$1" "$2" >>"$GITHUB_ENV"
  else
    printf 'export %s=%q\n' "$1" "$2"
  fi
}

mask() {
  if [[ -n "${GITHUB_ACTIONS:-}" && -n "$1" ]]; then
    printf '::add-mask::%s\n' "$1"
  fi
}

mask_file_lines() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      "" | -----*) ;;
      *) mask "$line" ;;
    esac
  done <"$1"
}

write_asc() {
  : "${ASC_KEY_ID:?ASC_KEY_ID secret is missing}"
  : "${ASC_ISSUER_ID:?ASC_ISSUER_ID secret is missing}"
  : "${ASC_KEY_P8:?ASC_KEY_P8 secret is missing}"
  mask "$ASC_KEY_ID"
  mask "$ASC_ISSUER_ID"
  local p8="$dir/AuthKey_${ASC_KEY_ID}.p8"
  local content="$ASC_KEY_P8"
  # Accept the .p8 pasted as-is, with literal "\n", or base64-encoded.
  if [[ "$content" != *"BEGIN PRIVATE KEY"* ]]; then
    content="$(printf '%s' "$content" | base64 -d 2>/dev/null || true)"
  fi
  # %b turns literal "\n" sequences into newlines (PEM base64 has no backslashes).
  printf '%b\n' "$content" >"$p8"
  if ! grep -q -- "-----BEGIN PRIVATE KEY-----" "$p8"; then
    echo "::error::ASC_KEY_P8 is not a PKCS#8 .p8 key (expected '-----BEGIN PRIVATE KEY-----')."
    exit 1
  fi
  mask_file_lines "$p8"
  export_env ASC_API_KEY_PATH "$p8"
  echo "App Store Connect API key written to a temp file."
}

write_asc_build_env() {
  if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
    echo "::notice::APPLE_TEAM_ID repository variable not set; eas build will use the credentials stored on EAS and cannot repair provisioning profiles in CI."
    return 0
  fi
  export_env EXPO_ASC_API_KEY_PATH "$dir/AuthKey_${ASC_KEY_ID}.p8"
  export_env EXPO_ASC_KEY_ID "$ASC_KEY_ID"
  export_env EXPO_ASC_ISSUER_ID "$ASC_ISSUER_ID"
  export_env EXPO_APPLE_TEAM_ID "$APPLE_TEAM_ID"
  export_env EXPO_APPLE_TEAM_TYPE "${APPLE_TEAM_TYPE:-INDIVIDUAL}" # INDIVIDUAL | COMPANY_OR_ORGANIZATION | IN_HOUSE
}

write_google() {
  : "${GOOGLE_SERVICE_ACCOUNT_JSON:?GOOGLE_SERVICE_ACCOUNT_JSON secret is missing}"
  local json="$dir/google-service-account.json"
  local content="$GOOGLE_SERVICE_ACCOUNT_JSON"
  if [[ "${content#"${content%%[![:space:]]*}"}" != "{"* ]]; then
    content="$(printf '%s' "$content" | base64 -d 2>/dev/null || true)"
  fi
  printf '%s' "$content" >"$json"
  # Validate and mask the private parts (multi-line JSON secrets are not
  # reliably masked by GitHub on their own).
  node -e '
    const fs = require("node:fs");
    let sa;
    try { sa = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
    catch { console.log("::error::GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON."); process.exit(1); }
    if (sa.type !== "service_account" || !sa.client_email || !sa.private_key) {
      console.log("::error::GOOGLE_SERVICE_ACCOUNT_JSON is not a service-account key (needs type, client_email, private_key).");
      process.exit(1);
    }
    if (process.env.GITHUB_ACTIONS) {
      for (const l of sa.private_key.split("\n")) if (l && !l.startsWith("-----")) console.log("::add-mask::" + l);
      if (sa.private_key_id) console.log("::add-mask::" + sa.private_key_id);
    }
  ' "$json"
  export_env GOOGLE_SERVICE_ACCOUNT_KEY_PATH "$json"
  echo "Google service account key written to a temp file."
}

case "$mode" in
  ios) write_asc ;;
  ios-build) write_asc && write_asc_build_env ;;
  android) write_google ;;
  all) write_asc && write_google ;;
  *)
    echo "usage: $0 <ios|ios-build|android|all|cleanup>" >&2
    exit 2
    ;;
esac
