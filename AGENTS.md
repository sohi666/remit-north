Expo SDK 58 / React Native app: **Remit North**, a Canadian payroll and small-business tax calculator.
Expo changes every SDK: check https://docs.expo.dev/versions/v58.0.0/ before touching Expo APIs; install
native packages with the version in `node_modules/expo/bundledNativeModules.json`.

## Layout
- `src/tax/` — pure TypeScript tax engine (no React, runs in Node):
  - `types.ts` pack schema; `packs/<year>.json` the tax tables (one per year, never hand-edit without
    adding/keeping reference checks); `validate.ts`; `packStore.ts` (built-in + downloaded packs, offline cache).
  - `engine/payroll.ts` CRA T4127 Option 1 + Revenu Québec TP-1015.F, period by period with YTD caps;
    bracket constants rounded like the publishers (`constantTax`).
  - `engine/personal.ts` annual tax incl. non-eligible dividends; `sales.ts` GST/HST/QST/PST regular vs
    Quick Method; `corporate.ts` CCPC tax; `ownerPay.ts` salary vs dividends.
- `src/screens/`, `src/ui/` — five tabs (custom tab bar in `App.tsx`, no router), UI kit, SVG charts, logo.
- `src/i18n.ts` — English and French; every user-facing string goes through it.
- `scripts/` — release tooling copied from Rotor, `verify-pack.ts`, `publish-tables.mjs`,
  `tables-watch.mjs`, `store-shots.py`, `assets/` (icon SVG sources + `render.mjs`).
- `site/` — public pages + tables feed for `sohi666/remit-north-info`.

## Rules
- `npm test`, `npm run verify:pack` and `npx tsc --noEmit` must pass. Any change to the engine or a pack
  must keep every reference check within 2 cents (they come from CRA PDOC and impot.net).
- Changing the pack schema (new fields the engine reads) requires bumping `PACK_SCHEMA` and a store
  release; installed apps reject packs with an unknown schema and keep their current tables.
- The app collects no data. Don't add analytics, ads or crash reporting without updating the privacy
  pages, App Privacy and Play Data safety first.
- Web (`npm run web:export`) is a preview/QA target: `?tab=payroll|sales|corp|owner|more`.
