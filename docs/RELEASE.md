# Remit North release manual

**Remit North: Payroll & Tax CA** (`com.behtoyi.remitnorth`, Consultation Behtoyi Inc.) uses the same
pipeline as Rotor: a git tag runs `.github/workflows/release.yml`, which builds on EAS (iOS) and on the
GitHub runner (Android), uploads to TestFlight and Google Play, and submits for review. Every milestone and
every **ACTION NEEDED** goes to ntfy. Rotor's `docs/RELEASE.md` (sohi666/Rotor) has the long-form
explanations; this file lists what differs and what you do once.

## 1. One-time setup (your part)

1. **Repositories.** Create the private repo `sohi666/remit-north` (push this project) and the public repo
   `sohi666/remit-north-info` (copy `site/` to its root, enable GitHub Pages from `main` / root).
   Check https://sohi666.github.io/remit-north-info/tables/index.json answers before the first release:
   the app downloads its tax tables from there, and App Review checks the privacy URL.
2. **ntfy.** Subscribe to a new topic in the ntfy app (for example `remitnorth-sb-<random>`), then secret
   `NTFY_TOPIC`.
3. **Expo.** `npx eas-cli@latest login`, `npx eas-cli@latest init` (writes `extra.eas.projectId` into
   `app.json`; commit it). Secret `EXPO_TOKEN` (reuse the robot token from Rotor).
4. **Apple** (individual account, team 3EJ7FPDYM4, until the Organization account is approved):
   - Identifiers → `com.behtoyi.remitnorth` (no capabilities needed).
   - App Store Connect → New App: iOS, name **Remit North: Payroll & Tax CA**, **primary language English (U.S.)**,
     bundle `com.behtoyi.remitnorth`, SKU `REMITNORTH-001`. Apple ID **6834669235** → secret `ASC_APP_ID`.
     (The record was created as "Remit North"; `deliver` sets the full name from `fastlane/metadata/*/name.txt`
     on the first review submission, or rename it under App Information.)
   - Reuse the Rotor API key secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`.
   - `npx eas-cli@latest credentials -p ios` → production → set up (distribution certificate is shared).
   - `npx eas-cli@latest credentials -p android` → production → new keystore.
   - Category: **Finance** (secondary Business). Price: Free. Age rating answers are all "None"
     (`fastlane/app_rating_config.json`).
   - **App Privacy: "Data Not Collected"** (the app has no SDKs that collect data; see `docs/store-forms.md`).
5. **Google Play** (Organization account): Create app → **Remit North: Payroll & Tax CA**, default language
   **English (United States) – en-US**, App, Free. Give the existing service account
   (`GOOGLE_SERVICE_ACCOUNT_JSON`) the release permissions for this app. Variable `PLAY_CONSOLE_APP_URL`.
   App content answers are in `docs/store-forms.md`.
6. **Tables feed token (optional but recommended).** A fine-grained token with Contents read/write on
   `sohi666/remit-north-info` → secret `INFO_REPO_TOKEN`. Without it, "Publish tables" pings you to copy
   `site/tables/` by hand.

## 2. Releasing

Same as Rotor: bump `expo.version` in `app.json`, update `fastlane/metadata/*/release_notes.txt` and
`fastlane/metadata/android/*/changelogs/default.txt`, then `git tag v1.0.0 && git push origin v1.0.0`.
First release order: iOS to TestFlight with `submit_for_review=false`, Android internal draft, test both,
then `ios_review_only=true` and `android_promote=true` (draft while the Play app is new).

Store screenshots are generated from the web build: `npm run web:export`, serve `dist/` on port 8088,
`python3 scripts/store-shots.py` (writes 6.9" iPhone PNGs to `fastlane/screenshots/<locale>/` and Play PNGs
to `fastlane/metadata/android/<locale>/images/phoneScreenshots/`). The icon and Play feature graphic come
from `scripts/assets/*.svg` via `node scripts/assets/render.mjs`.

## 3. Tax tables: how they stay current

- **Source of truth:** `src/tax/packs/<year>.json`. Each pack carries reference checks (cases verified
  against CRA's PDOC and impot.net). `npm run verify:pack` and the test suite fail if any check is off by more
  than 2 cents.
- **In the app:** the built-in pack always works offline. Every 12 hours (and on "Check for new tables")
  the app reads `tables/index.json`, downloads newer packs, validates them (structure + the pack's own
  reference checks run through the app's engine) and keeps them on the device. A pack that fails is
  rejected and the current one stays.
- **Publishing:** a change to `src/tax/packs/` on `main` runs "Publish tables", which validates and pushes
  the feed to `remit-north-info`. Apps pick it up without a store release, as long as the pack schema
  (`schema: 1`) does not change. A new field the engine needs is a store release.
- **Watching the governments:** "Tax tables watch" runs every Monday. It notifies you when the CRA T4127
  page or Revenu Québec's "principal changes" pages change (new January/July editions, next year's
  Quebec page), and checks every bracket in the shipped pack against the CRA's own CSV
  (`rtsncmtrshldcnstnt-MM-YYe.csv`). The CSV check only looks for the numbers, so a layout change cannot
  break it, but it has not run against the real file yet (the build sandbox could not reach canada.ca).
- **Yearly rollover (December/January):** add `src/tax/packs/2027.json` with the new rates and new
  reference checks (run PDOC and impot.net for the same cases), push to `main`. Users get 2027 tables
  without updating the app and can switch years in Settings.

## 4. Notifications

Identical to Rotor (see its manual, section 3), with "Remit North" in the titles, plus:

| Title | What to do |
|---|---|
| **ACTION NEEDED: Remit North tax tables** | A government page changed. Ask Claude to update the pack (`src/tax/packs`). |
| **ACTION NEEDED: Remit North pack differs from CRA** | Some shipped numbers aren't in the CRA CSV: new edition or a typo. Same fix. |
| **ACTION NEEDED: publish Remit North tables** | `INFO_REPO_TOKEN` missing; copy `site/tables/` to `remit-north-info`. |
| `Remit North tables published` | The new feed is live; installed apps update within 12 hours. |

## 5. Monetization later (not in 1.0)

Nothing in 1.0 collects data, so App Privacy is "Data Not Collected". Ideas that keep that promise:
a one-time "Pro" unlock (PDF pay stubs, saved employees, remittance calendar reminders, multi-year
comparisons) through RevenueCat, like Rotor's planned 1.1. Ads would change the privacy answers and the
Play declarations (see Rotor's manual, "Turning ads on").
