#!/usr/bin/env bash
# CI helper: turn a failed step's log into one actionable ntfy notification.
#
#   scripts/ci/explain-failure.sh <stage> [log-file]
#
# stage: build | ios-upload | ios-review | android-upload | store-urls
#
# Env used for links/text (all optional): RUN_URL, ASC_APP_URL, PLAY_CONSOLE_URL,
# BUILD_PAGE, AAB_URL, APP_VERSION, BUILD_NUMBER, ANDROID_TRACK, PLATFORM_LABEL
#
# Known failures become "ACTION NEEDED" (high priority) with the fix in the
# message; anything else is a generic urgent failure linking to the run log.
# See docs/RELEASE.md ("Notifications") for the catalogue.
set -uo pipefail

stage="${1:?usage: explain-failure.sh <stage> [log-file]}"
log="${2:-/dev/null}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
notify="$here/../notify.sh"

run_url="${RUN_URL:-}"
asc="${ASC_APP_URL:-https://appstoreconnect.apple.com/apps}"
play="${PLAY_CONSOLE_URL:-https://play.google.com/console/developers}"
ver="${APP_VERSION:-?}${BUILD_NUMBER:+ (${BUILD_NUMBER})}"
label="${PLATFORM_LABEL:-}"

# Only look at error-looking lines near the end of the log. Option tables that
# fastlane prints ("| skip_screenshots | true |") are dropped so parameter names
# never trigger a diagnosis.
scan="$(mktemp)"
trap 'rm -f "$scan"' EXIT
if [[ -f "$log" ]]; then
  tail -n 150 "$log" |
    grep -vE '^[[:space:]]*(\[[0-9:]+\]:[[:space:]]*)?[|+]' |
    grep -iE '\[!\]|error|fail|denied|reject|cannot|can.t|can not|must |missing|required|invalid|not allowed|unable|not found|draft app|limit|quota|space left|OutOfMemory|heap space|APP_' >"$scan" || true
fi
has() { grep -qiE -- "$1" "$scan"; }

title="" msg="" prio="high" tags="warning" click="$run_url"
export NTFY_ACTIONS="${run_url:+view, Run log, ${run_url}}"

action() { # action <title> <message> [click]
  title="ACTION NEEDED: $1"
  msg="$2"
  click="${3:-$run_url}"
  prio="high"
  tags="warning"
}

case "$stage" in
  build)
    if has "Credentials are not set up|Distribution Certificate|Provisioning Profile|authentication with an ASC API key is required"; then
      action "iOS signing credentials" "EAS has no usable iOS distribution certificate/profile for com.behtoyi.remitnorth. On any computer run: npx eas-cli@latest credentials -p ios -> production -> set up all credentials (Apple ID login). Then re-run the release. Setting the APPLE_TEAM_ID repo variable lets CI repair expired profiles by itself." "${BUILD_PAGE:-$run_url}"
    elif has "keystore"; then
      action "Android keystore" "EAS could not use the Android upload keystore. Run: npx eas-cli@latest credentials -p android and check the production keystore." "${BUILD_PAGE:-$run_url}"
    elif has "Disk quota exceeded|No space left on device|OutOfMemoryError|Java heap space|lost communication"; then
      title="Remit North build FAILED${label:+ (${label})}: runner out of disk or memory"
      msg="The build machine ran out of disk space or memory (not your code, not an EAS quota). The release workflow frees disk and adds swap; open the run log, raise those limits or drop a CPU architecture, then re-run."
      click="$run_url" prio="urgent" tags="rotating_light"
    elif has "free (plan|tier)|build limit|reached.*limit|limit.*reached|(build|plan|monthly|usage) quota|quota (exceeded|reached) for"; then
      action "EAS build quota" "The Expo free-plan build quota for this month is used up (15 iOS + 15 Android builds). Wait for the monthly reset or upgrade the plan on expo.dev, then re-run." "https://expo.dev/pricing"
    elif has "projectId|EAS project|eas init"; then
      action "EAS project link" "app.json has no valid extra.eas.projectId / owner. Run: npx eas-cli@latest init, commit app.json, re-run." "$run_url"
    elif has "EXPO_TOKEN|not logged in|unauthori[sz]ed"; then
      action "Expo token" "EXPO_TOKEN is missing, expired or lacks access. Create a robot token in expo.dev -> account settings -> Access tokens and update the repository secret." "$run_url"
    else
      title="Remit North build FAILED${label:+ (${label})}"
      msg="EAS build ${ver} failed. Open the EAS build page for the native logs."
      prio="urgent" tags="rotating_light" click="${BUILD_PAGE:-$run_url}"
    fi
    ;;

  ios-upload)
    if has "agreement"; then
      action "Apple agreement" "App Store Connect blocks uploads until the latest agreement is accepted by the Account Holder: App Store Connect -> Business -> Agreements. Then re-run." "https://appstoreconnect.apple.com/business"
    elif has "bundle version must be higher|CFBundleVersion|already been used|redundant binary"; then
      action "iOS build number" "Build number ${BUILD_NUMBER:-?} was already uploaded. Run npx eas-cli@latest build:version:set -p ios with a higher number and rebuild." "$asc/testflight/ios"
    elif has "ascAppId|App Store Connect App ID"; then
      action "ASC_APP_ID secret" "ASC_APP_ID must be the numeric Apple ID of the app (App Store Connect -> App -> App Information -> Apple ID)." "$asc"
    elif has "401|NOT_AUTHORIZED|authentication credentials|Issuer ID|api key"; then
      action "App Store Connect API key" "Apple rejected the API key. Check ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 (Users and Access -> Integrations -> App Store Connect API) and that the key is not revoked." "https://appstoreconnect.apple.com/access/integrations/api"
    elif has "built with .*SDK|SDK version|Xcode [0-9]+|minimum.*Xcode"; then
      action "iOS SDK too old" "Apple refused the binary's SDK/Xcode version. Bump the EAS build image (eas.json build.production.ios.image) or the Expo SDK, then rebuild." "$run_url"
    else
      title="TestFlight upload FAILED"
      msg="eas submit could not upload iOS ${ver}. Open the run log (it links the EAS submission page)."
      prio="urgent" tags="rotating_light"
    fi
    ;;

  ios-review)
    if has "APP_BUILD_TIMEOUT"; then
      action "build still processing" "Build ${ver} did not finish processing in time. When TestFlight shows it as ready, re-run the failed job (or: bundle exec fastlane ios submit_review)." "$asc/testflight/ios"
    elif has "APP_BUILD_INVALID"; then
      action "build rejected by processing" "Apple marked build ${ver} invalid or failed. Apple emails the reason (missing usage strings, bad entitlements...). Fix and rebuild." "$asc/testflight/ios"
    elif has "screenshot"; then
      action "iOS screenshots" "App Review needs screenshots for every locale (6.9-inch iPhone; 13-inch iPad as long as ios.supportsTablet is true). Add PNGs under fastlane/screenshots/fr-CA and en-US, or upload them in App Store Connect, then re-run." "$asc/distribution"
    elif has "privacyPolicyUrl|privacy policy"; then
      action "privacy policy URL" "The privacy policy URL is missing or invalid. Publish the page and update fastlane/metadata/*/privacy_url.txt." "$asc/distribution"
    elif has "app ?privacy|appDataUsage|data usage|privacy details"; then
      action "App Privacy questionnaire" "Fill and PUBLISH App Store Connect -> App -> App Privacy (draft answers in docs/store-forms.md), then re-run." "$asc/distribution"
    elif has "price|pricing|availability|territor"; then
      action "pricing and availability" "Set App Store Connect -> App -> Pricing and Availability (Free, pick countries), then re-run." "$asc/distribution"
    elif has "age ?rating|ageRating|rating config"; then
      action "age rating" "The age-rating answers were refused. Compare fastlane/app_rating_config.json with App Store Connect -> App Information -> Age Rating (Apple adds questions over time), fix, re-run." "$asc/distribution"
    elif has "contentRights|content rights"; then
      action "content rights" "Answer App Store Connect -> App Information -> Content Rights (no third-party content), then re-run." "$asc/distribution"
    elif has "export compliance|usesNonExemptEncryption"; then
      action "export compliance" "Build ${ver} needs export-compliance answers. Set ios.config.usesNonExemptEncryption=false in app.json for future builds; answer it on the build in TestFlight now." "$asc/testflight/ios"
    elif has "agreement"; then
      action "Apple agreement" "Accept the pending agreement in App Store Connect -> Business, then re-run." "https://appstoreconnect.apple.com/business"
    elif has "whatsNew|what.s new"; then
      action "release notes" "Apple refused 'What's New' (normal for a first version). Re-run with repository variable IOS_FIRST_RELEASE=true." "$run_url"
    elif has "reviewSubmission|review submission|another submission|already .*review"; then
      action "review submission busy" "App Store Connect already has an open review submission. Open App Review, cancel or finish it, then re-run." "$asc/distribution"
    elif has "Could not find (a )?build|does not exist|APP_BUILD_NOT_FOUND"; then
      action "build not found" "App Store Connect has no build ${ver}. Check TestFlight (Apple emails the reason when processing fails)." "$asc/testflight/ios"
    elif has "category"; then
      action "app category" "Apple refused the category in fastlane/metadata/primary_*category.txt. Pick it in App Store Connect -> App Information and re-run." "$asc/distribution"
    elif grep -q "review blocker ERROR" "$scan"; then
      action "App Review blockers" "Apple says: $(grep -oE 'review blocker ERROR: .*' "$scan" | cut -c23- | head -4 | paste -sd ';' -). Fix them in App Store Connect, then re-run with ios_review_only = true." "$asc/distribution"
    else
      title="iOS review submission FAILED"
      msg="fastlane could not submit ${ver} for review. Open the run log; Apple's error is near the end."
      prio="urgent" tags="rotating_light"
    fi
    ;;

  android-upload)
    aab="${AAB_URL:-$run_url}"
    export NTFY_ACTIONS="view, Download .aab, ${aab}; view, Play Console, ${play}${BUILD_PAGE:+; view, EAS build, ${BUILD_PAGE}}"
    if has "changesNotSentForReview|not (yet )?been completed|App content|declaration|complete the .*(setup|questionnaire)|precondition|policy (declaration|requirements)|Data safety|content rating"; then
      action "finish Play Console setup" "Google won't accept a production release until the Play Console Dashboard tasks are done (app content: privacy policy, ads, data safety, content rating, target audience; store listing; countries). Finish them, then re-run with android_promote." "$play"
    elif has "Package not found|applicationNotFound|upload.*manually|manual(ly)? upload|first (release|upload)|has not been uploaded"; then
      action "first Android upload is manual" "Google Play has never received a build for com.behtoyi.remitnorth, so the API cannot upload yet. 1) Download the .aab (button; GitHub login). 2) Play Console -> Remit North -> Test and release -> Testing -> Internal testing -> Create new release -> upload it -> Next -> Save and publish. 3) Later releases are automatic." "$aab"
    elif has "draft app|Only releases with status draft"; then
      action "Play app is still a draft" "Google accepts only DRAFT releases until the app is published once. Re-run the release with android_track=internal and android_release_status=draft, finish the Dashboard setup tasks in Play Console, then roll the release out there." "$play"
    elif [[ "${PLAY_STEP:-}" == "listing" ]] && has "caller does not have permission"; then
      action "Play draft-app permission" "Google refused to save the store listing. While Remit North is unpublished it is a draft app: Play Console -> Users and permissions -> (service account) -> App permissions -> Remit North -> tick 'Edit and delete draft apps' (Draft apps) -> Apply -> Save changes." "$play"
    elif has "caller does not have permission|403|PERMISSION_DENIED|insufficient permission|cannot submit this app"; then
      # EAS words this as "cannot submit this app. Check its key and app permissions":
      # the key authenticated fine, the account just has no access to the app.
      action "Play service account permissions" "The key works but the service account has no access to Remit North. Play Console -> Users and permissions -> Invite new users -> the service account e-mail (client_email in the JSON) -> App permissions -> Remit North -> allow releasing to testing tracks and production -> Invite. Meanwhile upload this .aab by hand once (Testing -> Internal testing -> Create new release)." "$play"
    elif has "version ?code|already been used"; then
      action "Android version code" "Version code ${BUILD_NUMBER:-?} is already used on Play. Run npx eas-cli@latest build:version:set -p android with a higher value and rebuild." "$play"
    elif has "Service Account|serviceAccountKeyPath|invalid_grant|private key"; then
      action "GOOGLE_SERVICE_ACCOUNT_JSON secret" "The Google service account key is missing or invalid (or deleted in Google Cloud). Create a new JSON key and update the secret." "https://console.cloud.google.com/iam-admin/serviceaccounts"
    elif has "target ?SDK|targetSdkVersion|API level"; then
      action "Android target SDK" "Google Play refused the target API level. Upgrade the Expo SDK (or expo-build-properties targetSdkVersion) and rebuild." "$play"
    else
      title="Play upload FAILED"
      msg="eas submit could not upload Android ${ver} to the ${ANDROID_TRACK:-?} track. The .aab is attached to the run if you want to upload it by hand."
      prio="urgent" tags="rotating_light" click="$aab"
    fi
    ;;

  store-urls)
    urls="$(grep -oE 'https?://[^ ]+' "$log" 2>/dev/null | sort -u | tr '\n' ' ')"
    action "store URLs not live" "These store URLs do not answer yet: ${urls:-see log}. Publish the pages (a privacy policy is mandatory) or edit fastlane/metadata/*/*_url.txt, then re-run with submit_for_review." "$run_url"
    ;;

  *)
    title="Remit North release FAILED"
    msg="Step '${stage}' failed. Open the run log."
    prio="urgent" tags="rotating_light"
    ;;
esac

if [[ -s "$scan" ]]; then
  echo "---- error lines considered (${log}) ----"
  cat "$scan"
fi
bash "$notify" "$title" "$msg" "$prio" "$tags" "$click"
