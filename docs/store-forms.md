# Store forms (Remit North 1.0)

## App Store Connect
- **App Privacy:** Data Not Collected. (No analytics, ads, crash reporting or accounts. The only network
  request downloads public tax tables; nothing about the user is sent.)
- **Age rating:** all "None" / "No" (`fastlane/app_rating_config.json`) → 4+.
- **Category:** Finance; secondary Business.
- **Export compliance:** `ITSAppUsesNonExemptEncryption = false` (HTTPS only).
- **Review notes:** `fastlane/metadata/review_information/notes.txt` (no login needed, not affiliated with
  the government, sources in Settings). Guideline 5.6/2.3 risk is the government look of a maple leaf:
  the listing and the Settings screen say the app is not affiliated with the CRA or Revenu Québec.

## Google Play — App content
- Privacy policy: https://sohi666.github.io/remit-north-info/en/privacy.html
- Ads: **No**
- App access: all functionality available without special access
- Content rating (IARC): utility/productivity, no sensitive content
- Target audience: 18+
- Data safety: **No data collected, no data shared**; data encrypted in transit: Yes (HTTPS); deletion:
  not applicable (nothing collected)
- Advertising ID: **No** (`AD_ID` permission is blocked in `app.json`)
- Government apps: **No**. Financial features: **None** (a calculator; no banking, loans, payments,
  trading or tax filing). Health: No.
