#!/usr/bin/env node
/**
 * App Store Connect setup that fastlane deliver doesn't cover, through the official API:
 *   - price: Free (base territory USA, applied worldwide)
 *   - availability: every territory, plus new ones automatically
 *   - App Review contact on the editable version (when REVIEW_PHONE is given)
 * Idempotent: anything already set is left as it is (pass --force-review to overwrite the contact).
 *
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, ASC_APP_ID,
 *      REVIEW_FIRST_NAME, REVIEW_LAST_NAME, REVIEW_PHONE, REVIEW_EMAIL (optional block)
 * The App Privacy questionnaire has no public API: answer it in App Store Connect.
 */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com';
const env = (k) => (process.env[k] ?? '').trim() || undefined;
const log = (...a) => console.log('[asc-setup]', ...a);

function pem(text) {
  let t = text.trim();
  if (!t.includes('-----BEGIN')) t = Buffer.from(t, 'base64').toString('utf8').trim();
  return t.replace(/\\n/g, '\n');
}
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url({ alg: 'ES256', kid: env('ASC_KEY_ID'), typ: 'JWT' })}.${b64url({
    iss: env('ASC_ISSUER_ID'),
    iat: now,
    exp: now + 15 * 60,
    aud: 'appstoreconnect-v1',
  })}`;
  const sig = sign('sha256', Buffer.from(input), { key: createPrivateKey(pem(env('ASC_KEY_P8'))), dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

async function asc(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = json.errors?.[0];
    const err = new Error(`${method} ${path} -> ${res.status} ${e?.code ?? ''}: ${e?.detail ?? e?.title ?? text.slice(0, 300)}`);
    err.errors = json.errors ?? [];
    throw err;
  }
  return json;
}

async function all(path) {
  const out = [];
  let next = API + path;
  while (next) {
    const page = await asc(next.slice(API.length));
    out.push(...page.data);
    next = page.links?.next;
  }
  return out;
}

const APP = env('ASC_APP_ID');
const NOTES = new URL('../fastlane/metadata/review_information/notes.txt', import.meta.url).pathname;

async function price() {
  const existing = await asc(`/v1/apps/${APP}/appPriceSchedule`).catch(() => null);
  if (existing?.data) {
    const manual = await asc(`/v1/appPriceSchedules/${existing.data.id}/manualPrices?include=appPricePoint&limit=5`).catch(() => null);
    if (manual?.data?.length) return log('price: already set, left unchanged');
  }
  const points = await all(`/v1/apps/${APP}/appPricePoints?filter[territory]=USA&limit=200`);
  const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
  if (!free) throw new Error('No free price point found for USA');
  await asc('/v1/appPriceSchedules', {
    method: 'POST',
    body: {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: APP } },
          baseTerritory: { data: { type: 'territories', id: 'USA' } },
          manualPrices: { data: [{ type: 'appPrices', id: '${price0}' }] },
        },
      },
      included: [
        {
          type: 'appPrices',
          id: '${price0}',
          attributes: { startDate: null },
          relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } },
        },
      ],
    },
  });
  log('price: Free');
}

async function availability() {
  const existing = await asc(`/v1/apps/${APP}/appAvailabilityV2`).catch(() => null);
  if (existing?.data) return log('availability: already set, left unchanged');
  const territories = await all('/v1/territories?limit=200');
  const ids = territories.map((t) => t.id);
  await asc('/v2/appAvailabilities', {
    method: 'POST',
    body: {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: 'apps', id: APP } },
          territoryAvailabilities: { data: ids.map((id) => ({ type: 'territoryAvailabilities', id: `\${${id}}` })) },
        },
      },
      included: ids.map((id) => ({
        type: 'territoryAvailabilities',
        id: `\${${id}}`,
        attributes: { available: true },
        relationships: { territory: { data: { type: 'territories', id } } },
      })),
    },
  });
  log(`availability: ${ids.length} territories, new territories included`);
}

async function reviewContact() {
  // Apple requires name, phone and email in every write to this record.
  const phone = env('REVIEW_PHONE');
  if (!phone) return log('review contact: REVIEW_PHONE not given, left unchanged (required before submitting)');
  const versions = await asc(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const editable = versions.data.find((v) =>
    ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(
      v.attributes.appStoreState ?? v.attributes.appVersionState,
    ),
  );
  if (!editable) return log('review contact: no editable version, skipped');
  const attributes = {
    contactFirstName: env('REVIEW_FIRST_NAME') ?? 'Sohrab',
    contactLastName: env('REVIEW_LAST_NAME') ?? 'Behtoyi',
    contactEmail: env('REVIEW_EMAIL') ?? 'support@cibinc.ca',
    demoAccountRequired: false,
    ...(phone ? { contactPhone: phone } : {}),
    ...(existsSync(NOTES) ? { notes: readFileSync(NOTES, 'utf8').trim().slice(0, 4000) } : {}),
  };
  const current = await asc(`/v1/appStoreVersions/${editable.id}/appStoreReviewDetail`).catch(() => null);
  if (current?.data) {
    await asc(`/v1/appStoreReviewDetails/${current.data.id}`, {
      method: 'PATCH',
      body: { data: { type: 'appStoreReviewDetails', id: current.data.id, attributes } },
    });
  } else {
    await asc('/v1/appStoreReviewDetails', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreReviewDetails',
          attributes,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: editable.id } } },
        },
      },
    });
  }
  log(
    `review contact: ${attributes.contactFirstName} ${attributes.contactLastName}, ${attributes.contactEmail}, phone ${phone ? 'set' : 'NOT set yet (required before submitting)'}, notes ${attributes.notes ? attributes.notes.length + ' chars' : 'unchanged'} (version ${editable.attributes.versionString})`,
  );
}

/** The editable (or rejected) iOS version and its App Review detail record. */
async function reviewDetail() {
  const versions = await asc(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const editable = versions.data.find((v) =>
    ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(
      v.attributes.appStoreState ?? v.attributes.appVersionState,
    ),
  );
  if (!editable) return null;
  const detail = await asc(`/v1/appStoreVersions/${editable.id}/appStoreReviewDetail`).catch(() => null);
  return detail?.data ? { version: editable, detail: detail.data } : null;
}

/**
 * Upload REVIEW_ATTACHMENT (e.g. the screen recording App Review asked for) to the App Review
 * information. An earlier attachment with the same file name is replaced.
 */
async function reviewAttachment() {
  const file = env('REVIEW_ATTACHMENT');
  if (!file) return log('review attachment: REVIEW_ATTACHMENT not given, skipped');
  if (!existsSync(file)) throw new Error(`review attachment: ${file} not found`);
  const found = await reviewDetail();
  if (!found) throw new Error('review attachment: no editable version with App Review information (run reviewContact first)');
  const name = basename(file);
  const data = readFileSync(file);
  const old = await asc(`/v1/appStoreReviewDetails/${found.detail.id}/appStoreReviewAttachments?limit=50`);
  for (const a of old.data.filter((a) => a.attributes.fileName === name)) {
    await asc(`/v1/appStoreReviewAttachments/${a.id}`, { method: 'DELETE' });
    log(`review attachment: removed the earlier ${name}`);
  }
  const created = await asc('/v1/appStoreReviewAttachments', {
    method: 'POST',
    body: {
      data: {
        type: 'appStoreReviewAttachments',
        attributes: { fileName: name, fileSize: statSync(file).size },
        relationships: { appStoreReviewDetail: { data: { type: 'appStoreReviewDetails', id: found.detail.id } } },
      },
    },
  });
  for (const op of created.data.attributes.uploadOperations ?? []) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: data.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`review attachment: upload part at ${op.offset} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  await asc(`/v1/appStoreReviewAttachments/${created.data.id}`, {
    method: 'PATCH',
    body: {
      data: {
        type: 'appStoreReviewAttachments',
        id: created.data.id,
        attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(data).digest('hex') },
      },
    },
  });
  for (let i = 0; i < 30; i++) {
    const a = await asc(`/v1/appStoreReviewAttachments/${created.data.id}`);
    const state = a.data.attributes.assetDeliveryState?.state;
    if (state === 'COMPLETE') return log(`review attachment: ${name} (${(data.length / 1e6).toFixed(1)} MB) uploaded`);
    if (state === 'FAILED')
      throw new Error(`review attachment: Apple could not process ${name}: ${JSON.stringify(a.data.attributes.assetDeliveryState.errors ?? [])}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  log(`review attachment: ${name} uploaded, Apple is still processing it`);
}

/** Apple's error plus its "associated errors" (fastlane and plain messages hide those). */
function explain(e) {
  const lines = [];
  for (const err of e.errors ?? []) {
    lines.push(`${err.code}: ${err.detail ?? err.title}`);
    for (const [where, list] of Object.entries(err.meta?.associatedErrors ?? {})) {
      for (const a of list) lines.push(`${a.code ?? ''} ${a.detail ?? a.title ?? ''} [${where.replace(/[0-9a-f-]{36}|\d{9,}/g, '…')}]`.trim());
    }
  }
  return lines.length ? lines : [e.message];
}

/** Resubmit an App Review submission that came back with unresolved issues (after fixing them). */
async function resubmit() {
  const open = await asc(`/v1/reviewSubmissions?filter[app]=${APP}&filter[platform]=IOS&filter[state]=UNRESOLVED_ISSUES&include=items&limit=5`);
  const sub = open.data[0];
  if (!sub) return log('resubmit: no review submission with unresolved issues');
  // A rejected item must be marked resolved (the "Edit" step in App Store Connect) before the
  // submission can go back; otherwise Apple answers "Version is not ready to be submitted yet".
  for (const it of (open.included ?? []).filter((i) => i.type === 'reviewSubmissionItems')) {
    log(`resubmit: item ${it.id} state ${it.attributes?.state}`);
    if (it.attributes?.state !== 'REJECTED') continue;
    try {
      await asc(`/v1/reviewSubmissionItems/${it.id}`, {
        method: 'PATCH',
        body: { data: { type: 'reviewSubmissionItems', id: it.id, attributes: { resolved: true } } },
      });
      log(`resubmit: item ${it.id} marked resolved`);
    } catch (e) {
      for (const l of explain(e)) console.error(`[asc-setup] review blocker ERROR: ${l}`);
      throw new Error(`could not mark item ${it.id} resolved (details above)`);
    }
  }
  try {
    await asc(`/v1/reviewSubmissions/${sub.id}`, {
      method: 'PATCH',
      body: { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } },
    });
  } catch (e) {
    for (const l of explain(e)) console.error(`[asc-setup] review blocker ERROR: ${l}`);
    throw new Error(`submission ${sub.id} was not resubmitted (details above)`);
  }
  log(`resubmit: submission ${sub.id} sent back to App Review`);
}

/**
 * Ask Apple whether the editable version can go to App Review, and print every blocker.
 * fastlane only shows "This resource cannot be reviewed, please check associated errors";
 * the associated errors (missing App Privacy, age rating answers, review contact...) are in
 * the error's meta. This adds the version to an open (unsubmitted) review submission and, if
 * Apple accepts it, removes it again, so nothing is submitted and fastlane can run afterwards.
 */
async function reviewReadiness() {
  const versions = await asc(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const editable = versions.data.find((v) =>
    ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(
      v.attributes.appStoreState ?? v.attributes.appVersionState,
    ),
  );
  if (!editable) return log('review readiness: no editable version (already in review or released?)');
  const open = await asc(`/v1/reviewSubmissions?filter[app]=${APP}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&include=items&limit=5`);
  let sub = open.data[0];
  if (sub?.relationships?.items?.data?.length) {
    return log(`review readiness: an unsubmitted App Review draft already holds ${sub.relationships.items.data.length} item(s); left alone`);
  }
  if (!sub) {
    sub = (
      await asc('/v1/reviewSubmissions', {
        method: 'POST',
        body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP } } } } },
      })
    ).data;
  }
  try {
    const item = await asc('/v1/reviewSubmissionItems', {
      method: 'POST',
      body: {
        data: {
          type: 'reviewSubmissionItems',
          relationships: {
            reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } },
            appStoreVersion: { data: { type: 'appStoreVersions', id: editable.id } },
          },
        },
      },
    });
    await asc(`/v1/reviewSubmissionItems/${item.data.id}`, { method: 'DELETE' }).catch((e) =>
      log(`review readiness: could not remove the test item: ${e.message}`),
    );
    log(`review readiness: version ${editable.attributes.versionString} is accepted for review (nothing was submitted)`);
  } catch (e) {
    const lines = [];
    for (const err of e.errors ?? []) {
      lines.push(`${err.code}: ${err.detail ?? err.title}`);
      for (const [where, list] of Object.entries(err.meta?.associatedErrors ?? {})) {
        for (const a of list) lines.push(`${a.code ?? ''} ${a.detail ?? a.title ?? ''} [${where.replace(/[0-9a-f-]{36}|\d{9,}/g, '…')}]`.trim());
      }
    }
    if (!lines.length) lines.push(e.message);
    for (const l of lines) console.error(`[asc-setup] review blocker ERROR: ${l}`);
    throw new Error(`version ${editable.attributes.versionString} cannot be submitted yet (${lines.length} problem(s) above)`);
  }
}

/** Attach a processed build of the editable version (BUILD_NUMBER, or the newest valid one). */
async function selectBuild() {
  const versions = await asc(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const editable = versions.data.find((v) =>
    ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState ?? v.attributes.appVersionState),
  );
  if (!editable) return log('build: no editable version');
  const want = env('BUILD_NUMBER');
  const builds = await asc(
    `/v1/builds?filter[app]=${APP}&filter[preReleaseVersion.version]=${encodeURIComponent(editable.attributes.versionString)}` +
      `&filter[processingState]=VALID&filter[expired]=false&sort=-uploadedDate&limit=20`,
  );
  const build = want ? builds.data.find((b) => b.attributes.version === want) : builds.data[0];
  if (!build) throw new Error(`build: no processed build ${want ?? ''} for ${editable.attributes.versionString}`);
  if (build.attributes.usesNonExemptEncryption == null) {
    await asc(`/v1/builds/${build.id}`, {
      method: 'PATCH',
      body: { data: { type: 'builds', id: build.id, attributes: { usesNonExemptEncryption: false } } },
    }).catch((e) => log(`build: export compliance not set: ${e.message}`));
  }
  await asc(`/v1/appStoreVersions/${editable.id}/relationships/build`, {
    method: 'PATCH',
    body: { data: { type: 'builds', id: build.id } },
  });
  log(`build: ${editable.attributes.versionString} (${build.attributes.version}) attached to the version`);
}

/** Add the editable version to a review submission and send it to App Review. */
async function submit() {
  const versions = await asc(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const editable = versions.data.find((v) =>
    ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState ?? v.attributes.appVersionState),
  );
  if (!editable) return log('submit: no editable version (already in review?)');
  const open = await asc(`/v1/reviewSubmissions?filter[app]=${APP}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&include=items&limit=5`);
  let sub = open.data[0];
  if (!sub) {
    sub = (
      await asc('/v1/reviewSubmissions', {
        method: 'POST',
        body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP } } } } },
      })
    ).data;
  }
  try {
    if (!sub.relationships?.items?.data?.length) {
      await asc('/v1/reviewSubmissionItems', {
        method: 'POST',
        body: {
          data: {
            type: 'reviewSubmissionItems',
            relationships: {
              reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } },
              appStoreVersion: { data: { type: 'appStoreVersions', id: editable.id } },
            },
          },
        },
      });
    }
    await asc(`/v1/reviewSubmissions/${sub.id}`, {
      method: 'PATCH',
      body: { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } },
    });
  } catch (e) {
    for (const l of explain(e)) console.error(`[asc-setup] review blocker ERROR: ${l}`);
    throw new Error(`version ${editable.attributes.versionString} was not submitted (details above)`);
  }
  log(`submit: version ${editable.attributes.versionString} sent to App Review`);
}

/** Print the live age-rating declaration with each attribute's JSON type (Apple changes this schema). */
async function ageRatingSchema() {
  const infos = await asc(`/v1/apps/${APP}/appInfos?limit=5`);
  for (const info of infos.data) {
    const decl = await asc(`/v1/appInfos/${info.id}/ageRatingDeclaration`).catch((e) => ({ error: e.message }));
    if (decl.error) return log(`age rating (${info.attributes.state ?? info.id}): ${decl.error}`);
    const attrs = decl.data?.attributes ?? {};
    log(
      `age rating (${info.attributes.state ?? info.id}): ` +
        Object.entries(attrs)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', '),
    );
  }
}

const missing = ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8', 'ASC_APP_ID'].filter((k) => !env(k));
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}`);
  process.exit(1);
}
// --only=reviewReadiness,ageRatingSchema runs just those steps.
const STEPS = { ageRatingSchema, price, availability, reviewContact, reviewAttachment, selectBuild, reviewReadiness, submit, resubmit };
const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',')
  .filter(Boolean);
const chosen = only
  ? only.map((n) => STEPS[n] ?? (console.error(`Unknown step ${n}`), process.exit(2)))
  : [ageRatingSchema, price, availability, reviewContact];
let failed = 0;
for (const step of chosen) {
  try {
    await step();
  } catch (e) {
    failed++;
    console.error(`[asc-setup] ${step.name} FAILED: ${e.message}`);
    // With --only the steps form a sequence (e.g. notes -> video -> resubmit): never resubmit after a failed step.
    if (only) break;
  }
}
process.exit(failed ? 1 : 0);
