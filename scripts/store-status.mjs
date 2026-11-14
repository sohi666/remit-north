#!/usr/bin/env node
/**
 * Store status monitor for Remit North (Node >= 22, zero npm dependencies).
 *
 * Polls App Store Connect (latest App Store version state, latest review
 * submission, latest TestFlight build) and Google Play (release status of every
 * track), compares the result with the previous snapshot in a JSON state file,
 * and sends an ntfy push ONLY when something changed. Rejections, approvals that
 * wait for a manual release, draft Play releases and API access problems are
 * sent as high-priority "ACTION NEEDED" pushes.
 *
 *   node scripts/store-status.mjs [--state .store-status/state.json] [--dry-run] [--skip-google]
 *
 * Env (each store is skipped with a log line when its secrets are missing):
 *   ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID, and ASC_KEY_P8 (contents) or ASC_API_KEY_PATH
 *   GOOGLE_SERVICE_ACCOUNT_JSON (contents) or GOOGLE_SERVICE_ACCOUNT_KEY_PATH
 *   ANDROID_PACKAGE (default com.behtoyi.remitnorth)
 *   NTFY_TOPIC, NTFY_SERVER (default https://ntfy.sh), NTFY_TOKEN (optional)
 *   PLAY_CONSOLE_URL (your app's Play Console URL, for tap-through links)
 *   SKIP_GOOGLE=true    keep the previous Play snapshot (used while a release runs,
 *                       so this script never opens a Play edit next to EAS Submit's)
 *   ASC_API_BASE, GOOGLE_API_BASE, GOOGLE_TOKEN_URL   endpoint overrides (tests only)
 *
 * Writes `changed=true|false` to $GITHUB_OUTPUT when running in GitHub Actions.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { isDeepStrictEqual } from 'node:util';

const { values: args } = parseArgs({
  options: {
    state: { type: 'string', default: process.env.STORE_STATUS_STATE || '.store-status/state.json' },
    'dry-run': { type: 'boolean', default: false },
    'skip-google': { type: 'boolean', default: false },
  },
});

const env = process.env;
const opt = (name) => (env[name] && env[name].trim() ? env[name].trim() : undefined);

const CFG = {
  ascBase: opt('ASC_API_BASE') ?? 'https://api.appstoreconnect.apple.com',
  googleBase: opt('GOOGLE_API_BASE') ?? 'https://androidpublisher.googleapis.com',
  googleTokenUrl: opt('GOOGLE_TOKEN_URL'),
  pkg: opt('ANDROID_PACKAGE') ?? 'com.behtoyi.remitnorth',
  ascAppId: opt('ASC_APP_ID'),
  ntfyServer: (opt('NTFY_SERVER') ?? 'https://ntfy.sh').replace(/\/+$/, ''),
  ntfyTopic: opt('NTFY_TOPIC'),
  ntfyToken: opt('NTFY_TOKEN'),
  playUrl: opt('PLAY_CONSOLE_URL') ?? 'https://play.google.com/console/developers',
  runUrl:
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : undefined,
  skipGoogle: args['skip-google'] || opt('SKIP_GOOGLE') === 'true',
};
const ascUrl = (path = '') => `https://appstoreconnect.apple.com/apps/${CFG.ascAppId}${path}`;

const log = (...a) => console.log('[store-status]', ...a);

// ---------------------------------------------------------------------------
// HTTP / JWT helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, body, where) {
    super(`${where}: HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function http(url, { method = 'GET', headers = {}, body, where = url } = {}) {
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new HttpError(res.status, json, where);
  return json;
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

function jwt(header, payload, key, signOpts = {}) {
  const input = `${b64url(header)}.${b64url(payload)}`;
  const signature = sign('sha256', Buffer.from(input), { key, ...signOpts });
  return `${input}.${signature.toString('base64url')}`;
}

/** Normalize a PEM pasted with literal "\n" or as base64. */
function pem(text) {
  let t = text.trim();
  if (!t.includes('-----BEGIN')) t = Buffer.from(t, 'base64').toString('utf8').trim();
  return t.replace(/\\n/g, '\n');
}

function describeError(e) {
  if (e instanceof HttpError) {
    const detail =
      e.body?.errors?.[0]?.detail ?? e.body?.errors?.[0]?.title ?? e.body?.error?.message ?? e.body?.error_description ?? e.body?.error ?? '';
    return { status: e.status, detail: String(detail).slice(0, 240) };
  }
  return { status: 0, detail: String(e.cause?.code ?? e.message ?? e).slice(0, 240) };
}

// ---------------------------------------------------------------------------
// App Store Connect
// ---------------------------------------------------------------------------

async function ascCredentials() {
  const keyId = opt('ASC_KEY_ID');
  const issuerId = opt('ASC_ISSUER_ID');
  let p8 = opt('ASC_KEY_P8');
  if (!p8 && opt('ASC_API_KEY_PATH')) p8 = await readFile(opt('ASC_API_KEY_PATH'), 'utf8').catch(() => undefined);
  const missing = [!keyId && 'ASC_KEY_ID', !issuerId && 'ASC_ISSUER_ID', !p8 && 'ASC_KEY_P8', !CFG.ascAppId && 'ASC_APP_ID'].filter(Boolean);
  return missing.length ? { missing } : { keyId, issuerId, key: createPrivateKey(pem(p8)) };
}

function ascToken({ keyId, issuerId, key }) {
  const now = Math.floor(Date.now() / 1000);
  return jwt(
    { alg: 'ES256', kid: keyId, typ: 'JWT' },
    { iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    key,
    { dsaEncoding: 'ieee-p1363' }, // JWS wants raw r||s, not DER
  );
}

async function checkApple() {
  const creds = await ascCredentials();
  if (creds.missing) {
    log(`App Store Connect skipped: missing ${creds.missing.join(', ')}`);
    return undefined;
  }
  const token = ascToken(creds);
  const get = (path, query) =>
    http(`${CFG.ascBase}${path}?${new URLSearchParams(query)}`, {
      headers: { authorization: `Bearer ${token}` },
      where: `ASC ${path.replace(CFG.ascAppId, ':id')}`,
    });
  const newest = (items, field) =>
    [...(items ?? [])].sort((a, b) => String(b.attributes?.[field] ?? '9').localeCompare(String(a.attributes?.[field] ?? '9')))[0];

  try {
    const snap = { error: null, version: null, review: null, build: null };

    const versions = await get(`/v1/apps/${CFG.ascAppId}/appStoreVersions`, { 'filter[platform]': 'IOS', limit: '10' });
    const v = newest(versions.data, 'createdDate');
    if (v) {
      const a = v.attributes ?? {};
      snap.version = { id: v.id, versionString: a.versionString ?? '?', state: a.appVersionState ?? a.appStoreState ?? 'UNKNOWN' };
    }

    const builds = await get('/v1/builds', {
      'filter[app]': CFG.ascAppId,
      sort: '-uploadedDate',
      limit: '1',
      include: 'preReleaseVersion',
    });
    const b = builds.data?.[0];
    if (b) {
      const pre = builds.included?.find((i) => i.type === 'preReleaseVersions' && i.id === b.relationships?.preReleaseVersion?.data?.id);
      snap.build = {
        id: b.id,
        version: pre?.attributes?.version ?? '?',
        number: b.attributes?.version ?? '?',
        state: b.attributes?.processingState ?? 'UNKNOWN',
      };
    }

    // Review submissions carry the rejection signal (UNRESOLVED_ISSUES) in the
    // newer review flow. Non-fatal if the endpoint is unavailable to this key.
    try {
      const subs = await get('/v1/reviewSubmissions', { 'filter[app]': CFG.ascAppId, 'filter[platform]': 'IOS', limit: '10' });
      const s = newest(subs.data, 'submittedDate');
      if (s) snap.review = { id: s.id, state: s.attributes?.state ?? 'UNKNOWN' };
    } catch (e) {
      log('reviewSubmissions not available:', describeError(e));
    }
    return snap;
  } catch (e) {
    const d = describeError(e);
    log('App Store Connect error:', d);
    return { error: { kind: d.status === 401 || d.status === 403 ? 'auth' : d.status === 404 ? 'not_found' : 'other', ...d } };
  }
}

// ---------------------------------------------------------------------------
// Google Play
// ---------------------------------------------------------------------------

async function googleCredentials() {
  let raw = opt('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw && opt('GOOGLE_SERVICE_ACCOUNT_KEY_PATH')) raw = await readFile(opt('GOOGLE_SERVICE_ACCOUNT_KEY_PATH'), 'utf8').catch(() => undefined);
  if (!raw) return { missing: ['GOOGLE_SERVICE_ACCOUNT_JSON'] };
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(text);
  if (!sa.client_email || !sa.private_key) return { missing: ['GOOGLE_SERVICE_ACCOUNT_JSON (client_email/private_key)'] };
  return sa;
}

async function googleAccessToken(sa) {
  const tokenUrl = CFG.googleTokenUrl ?? sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    { alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) },
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: tokenUrl, iat: now, exp: now + 3600 },
    createPrivateKey(pem(sa.private_key)),
  );
  const res = await http(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    where: 'Google OAuth token',
  });
  if (!res.access_token) throw new Error('Google OAuth: no access_token in response');
  return res.access_token;
}

async function checkGoogle() {
  let sa;
  try {
    sa = await googleCredentials();
  } catch (e) {
    return { error: { kind: 'auth', status: 0, detail: `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (${e.message})` } };
  }
  if (sa.missing) {
    log(`Google Play skipped: missing ${sa.missing.join(', ')}`);
    return undefined;
  }
  const base = `${CFG.googleBase}/androidpublisher/v3/applications/${encodeURIComponent(CFG.pkg)}/edits`;
  let token;
  let editId;
  try {
    token = await googleAccessToken(sa);
    const headers = { authorization: `Bearer ${token}` };
    // Read-only use of an edit: open, list tracks, delete (never commit).
    const edit = await http(base, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}', where: 'Play edits.insert' });
    editId = edit.id;
    const res = await http(`${base}/${editId}/tracks`, { headers, where: 'Play tracks.list' });
    const tracks = {};
    for (const t of res.tracks ?? []) {
      tracks[t.track] = (t.releases ?? []).map((r) => ({
        name: r.name ?? '',
        versionCodes: (r.versionCodes ?? []).map(String),
        status: r.status ?? 'unknown',
        ...(r.userFraction != null ? { userFraction: r.userFraction } : {}),
      }));
    }
    return { error: null, tracks };
  } catch (e) {
    const d = describeError(e);
    log('Google Play error:', d);
    const notFound = d.status === 404 || /not found|applicationNotFound/i.test(d.detail);
    const auth = d.status === 401 || d.status === 403 || /invalid_grant|permission/i.test(d.detail);
    return { error: { kind: notFound ? 'not_found' : auth ? 'auth' : 'other', ...d } };
  } finally {
    if (editId && token) {
      await http(`${base}/${editId}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` }, where: 'Play edits.delete' }).catch((e) =>
        log('could not delete Play edit (it expires on its own):', describeError(e)),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Change detection -> events
// ---------------------------------------------------------------------------

/** p: ntfy priority 1-5; act: needs the human; tags: ntfy emoji short codes. */
const VERSION_STATES = {
  PREPARE_FOR_SUBMISSION: { label: 'being prepared', p: 2, tags: 'memo', text: 'is in Prepare for Submission (not sent to Apple yet).' },
  READY_FOR_REVIEW: { label: 'ready, not submitted', p: 2, tags: 'memo', text: 'is ready for review but not submitted yet.' },
  WAITING_FOR_REVIEW: { label: 'waiting for review', p: 3, tags: 'hourglass_flowing_sand', text: 'is waiting for App Review.' },
  IN_REVIEW: { label: 'in review', p: 3, tags: 'mag', text: 'is in App Review.' },
  ACCEPTED: { label: 'approved', p: 3, tags: 'white_check_mark', text: 'was approved.' },
  PENDING_DEVELOPER_RELEASE: { label: 'APPROVED, release it',
    p: 4, act: true, tags: 'white_check_mark',
    text: 'was APPROVED and waits for you: App Store Connect > App Store > this version > Release This Version.',
  },
  PENDING_APPLE_RELEASE: { label: 'approved, scheduled', p: 3, tags: 'white_check_mark', text: 'was approved; Apple releases it on the scheduled date.' },
  PROCESSING_FOR_APP_STORE: { label: 'approved, processing', p: 3, tags: 'gear', text: 'was approved and is being processed for the App Store.' },
  PROCESSING_FOR_DISTRIBUTION: { label: 'approved, processing', p: 3, tags: 'gear', text: 'was approved and is being processed for distribution.' },
  READY_FOR_SALE: { label: 'LIVE', p: 4, tags: 'tada', text: 'is LIVE on the App Store.' },
  READY_FOR_DISTRIBUTION: { label: 'LIVE', p: 4, tags: 'tada', text: 'is LIVE on the App Store.' },
  REJECTED: { label: 'REJECTED',
    p: 5, act: true, tags: 'rotating_light',
    text: 'was REJECTED by App Review. Read the message in App Store Connect > App Review, then reply or fix and resubmit (docs/RELEASE.md > Rejections).',
  },
  METADATA_REJECTED: { label: 'METADATA REJECTED',
    p: 5, act: true, tags: 'rotating_light',
    text: 'METADATA was rejected (no new build needed). Fix the listing in fastlane/metadata or App Store Connect, then resubmit.',
  },
  INVALID_BINARY: { label: 'INVALID BINARY', p: 5, act: true, tags: 'rotating_light', text: 'has an INVALID BINARY. Apple emailed the reason; fix and rebuild.' },
  WAITING_FOR_EXPORT_COMPLIANCE: { label: 'export compliance needed',
    p: 4, act: true, tags: 'warning',
    text: 'is blocked on export compliance: answer it on the build in App Store Connect > TestFlight.',
  },
  DEVELOPER_REJECTED: { label: 'pulled from review', p: 2, tags: 'leftwards_arrow_with_hook', text: 'was pulled from review (by you).' },
  REPLACED_WITH_NEW_VERSION: { label: 'replaced', p: 2, tags: 'arrows_counterclockwise', text: 'was replaced by a newer version.' },
  REMOVED_FROM_SALE: { label: 'REMOVED FROM SALE', p: 5, act: true, tags: 'rotating_light', text: 'was REMOVED FROM SALE by Apple. Check App Store Connect and your email.' },
  DEVELOPER_REMOVED_FROM_SALE: { label: 'removed from sale', p: 3, tags: 'no_entry', text: 'was removed from sale (by you).' },
};
const REVIEW_STATES = {
  READY_FOR_REVIEW: null, // draft submission, not interesting
  WAITING_FOR_REVIEW: null, // reported through the version state
  IN_REVIEW: null,
  UNRESOLVED_ISSUES: { label: 'review issues (rejected)',
    p: 5, act: true, tags: 'rotating_light',
    text: 'App Review reported UNRESOLVED ISSUES (a rejection). Open App Store Connect > App Review to read and answer.',
  },
  CANCELING: { label: 'review cancelling', p: 2, tags: 'leftwards_arrow_with_hook', text: 'Review submission is being cancelled.' },
  COMPLETING: null,
  COMPLETE: null,
};
const BUILD_STATES = {
  PROCESSING: { label: 'processing', p: 2, tags: 'gear', text: 'is processing in TestFlight.' },
  VALID: { label: 'ready in TestFlight', p: 3, tags: 'airplane', text: 'finished processing and is ready in TestFlight.' },
  FAILED: { label: 'processing FAILED', p: 5, act: true, tags: 'rotating_light', text: 'FAILED processing. Apple emailed the reason; fix and rebuild.' },
  INVALID: { label: 'INVALID', p: 5, act: true, tags: 'rotating_light', text: 'is INVALID. Apple emailed the reason; fix and rebuild.' },
};

function appleEvents(prev, cur) {
  const ev = [];
  if (!cur) return ev;
  if (!isDeepStrictEqual(prev?.error ?? null, cur.error ?? null)) {
    if (cur.error) {
      const e = cur.error;
      ev.push(
        e.kind === 'auth'
          ? { p: 4, act: true, tags: 'key', short: 'API key refused', click: 'https://appstoreconnect.apple.com/access/integrations/api',
              text: `App Store Connect API refused the key (HTTP ${e.status}). Check ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 and that the key is not revoked. ${e.detail}` }
          : e.kind === 'not_found'
            ? { p: 4, act: true, tags: 'mag', short: 'app not found', click: 'https://appstoreconnect.apple.com/apps',
                text: `App ${CFG.ascAppId} not found (HTTP 404). Check the ASC_APP_ID secret (App Information > Apple ID). ${e.detail}` }
            : { p: 3, tags: 'warning', short: 'API error', text: `App Store Connect API error (HTTP ${e.status}): ${e.detail}` },
      );
    } else if (prev?.error) ev.push({ p: 2, tags: 'white_check_mark', short: 'API access restored', text: 'App Store Connect API access works again.' });
  }
  if (cur.error) return ev;

  const pv = prev?.version;
  const cv = cur.version;
  if (cv && (pv?.id !== cv.id || pv?.state !== cv.state)) {
    const m = VERSION_STATES[cv.state] ?? { label: cv.state, p: 3, tags: 'information_source', text: `is now ${cv.state}.` };
    ev.push({ ...m, click: ascUrl('/distribution'), text: `Version ${cv.versionString} ${m.text}`, short: `${cv.versionString} ${m.label}` });
  }
  const pr = prev?.review;
  const cr = cur.review;
  if (cr && (pr?.id !== cr.id || pr?.state !== cr.state)) {
    const m = REVIEW_STATES[cr.state] === undefined
      ? { label: `review ${cr.state}`, p: 2, tags: 'information_source', text: `Review submission is now ${cr.state}.` }
      : REVIEW_STATES[cr.state];
    if (m) ev.push({ ...m, click: ascUrl('/distribution'), short: m.label });
  }
  const pb = prev?.build;
  const cb = cur.build;
  if (cb && (pb?.id !== cb.id || pb?.state !== cb.state)) {
    const m = BUILD_STATES[cb.state] ?? { label: cb.state, p: 2, tags: 'information_source', text: `is ${cb.state}.` };
    ev.push({ ...m, click: ascUrl('/testflight/ios'), text: `TestFlight build ${cb.version} (${cb.number}) ${m.text}`, short: `build ${cb.version} (${cb.number}) ${m.label}` });
  }
  return ev;
}

const describeRelease = (r) =>
  `${r.name || 'unnamed'} [${r.versionCodes.join(',') || '-'}] ${r.status}${r.userFraction != null ? ` ${Math.round(r.userFraction * 100)}%` : ''}`;

function googleEvents(prev, cur) {
  const ev = [];
  if (!cur) return ev;
  if (!isDeepStrictEqual(prev?.error ?? null, cur.error ?? null)) {
    if (cur.error) {
      const e = cur.error;
      ev.push(
        e.kind === 'not_found'
          ? { p: 4, act: true, tags: 'mag', short: 'app not on Play yet', click: CFG.playUrl,
              text: `Google Play does not know ${CFG.pkg} yet (HTTP ${e.status}). Create the app in Play Console and do the first .aab upload by hand (docs/RELEASE.md). ${e.detail}` }
          : e.kind === 'auth'
            ? { p: 4, act: true, tags: 'key', short: 'service account refused', click: CFG.playUrl,
                text: `Google Play API refused the service account (HTTP ${e.status}). Play Console > Users and permissions: give it access to Remit North; check the JSON key. ${e.detail}` }
            : { p: 3, tags: 'warning', short: 'API error', text: `Google Play API error (HTTP ${e.status}): ${e.detail}` },
      );
    } else if (prev?.error) ev.push({ p: 2, tags: 'white_check_mark', short: 'API access restored', text: 'Google Play API access works again.' });
  }
  if (cur.error) return ev;

  const names = new Set([...Object.keys(prev?.tracks ?? {}), ...Object.keys(cur.tracks ?? {})]);
  for (const track of [...names].sort()) {
    const before = prev?.tracks?.[track] ?? [];
    const after = cur.tracks?.[track] ?? [];
    if (isDeepStrictEqual(before, after)) continue;
    if (!after.length) {
      if (before.length) ev.push({ p: 2, tags: 'information_source', short: `${track} empty`, text: `Play ${track}: no releases any more.` });
      continue;
    }
    const drafts = after.filter((r) => r.status === 'draft');
    const halted = after.filter((r) => r.status === 'halted');
    const text = `Play ${track}: ${after.map(describeRelease).join('; ')}`;
    const short = `${track} ${after.map((r) => r.status).join('+')}`;
    if (drafts.length)
      ev.push({ p: 4, act: true, tags: 'memo', short: `${track} draft waiting`, click: CFG.playUrl,
        text: `${text}. A DRAFT release waits for you: Play Console > Test and release > ${track} > Edit release > Review > roll out.` });
    else if (halted.length) ev.push({ p: 4, tags: 'pause_button', short, click: CFG.playUrl, text: `${text}. Rollout is HALTED.` });
    else
      ev.push({ p: 3, tags: track === 'production' ? 'rocket' : 'robot', short, click: CFG.playUrl,
        text: `${text}. (The API cannot show review status: "completed" means sent to Google / published. Google emails rejections; see Publishing overview.)` });
  }
  return ev;
}

// ---------------------------------------------------------------------------
// ntfy
// ---------------------------------------------------------------------------

function headerSafe(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
}

async function push({ title, message, priority, tags, click }) {
  log(`notify (${priority}) ${title}\n  ${message.replace(/\n/g, '\n  ')}`);
  if (args['dry-run']) return;
  if (!CFG.ntfyTopic) {
    log('NTFY_TOPIC not set: notification only logged.');
    return;
  }
  const headers = { title: headerSafe(title), priority: String(priority), 'content-type': 'text/plain; charset=utf-8' };
  if (tags) headers.tags = tags;
  if (click) headers.click = click;
  if (CFG.runUrl) headers.actions = `view, Monitor run, ${CFG.runUrl}`;
  if (CFG.ntfyToken) headers.authorization = `Bearer ${CFG.ntfyToken}`;
  try {
    await http(`${CFG.ntfyServer}/${encodeURIComponent(CFG.ntfyTopic)}`, { method: 'POST', headers, body: message.slice(0, 3900), where: 'ntfy' });
  } catch (e) {
    console.log(`::warning::ntfy delivery failed: ${JSON.stringify(describeError(e))}`);
  }
}

async function sendGroup(platform, events, baseline) {
  if (!events.length) return;
  const priority = Math.max(...events.map((e) => (baseline && !e.act ? Math.min(e.p, 2) : e.p)));
  const act = events.some((e) => e.act);
  const lead = [...events].sort((a, b) => (b.act - a.act) || (b.p - a.p))[0];
  const tags = [...new Set(events.flatMap((e) => (e.tags ?? '').split(',')).filter(Boolean))].slice(0, 4).join(',');
  const summary = lead.short ?? lead.text.slice(0, 60);
  const more = events.length > 1 ? ` (+${events.length - 1})` : '';
  const title = `${act ? 'ACTION NEEDED: ' : ''}Remit North ${platform}${baseline && !act ? ' status' : ''}: ${summary}${more}`;
  await push({ title, message: events.map((e) => `- ${e.text}`).join('\n'), priority, tags, click: lead.click });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function loadState(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const prev = await loadState(args.state);
  const baseline = !prev;
  if (baseline) log(`no previous state at ${args.state}: this run records a baseline.`);

  const [appleNow, googleNow] = await Promise.all([
    checkApple(),
    CFG.skipGoogle ? (log('Google Play skipped: a release is running (keeping the previous snapshot).'), undefined) : checkGoogle(),
  ]);
  // On an API error keep the last good data, so recovery only reports real changes.
  const keep = (cur, before, fields) =>
    cur?.error ? { ...Object.fromEntries(fields.map((f) => [f, before?.[f] ?? null])), ...cur } : cur;
  const apple = keep(appleNow, prev?.apple, ['version', 'review', 'build']);
  const google = keep(googleNow, prev?.google, ['tracks']);

  const next = {
    apple: apple ?? prev?.apple ?? null,
    google: google ?? prev?.google ?? null,
  };

  await sendGroup('iOS', appleEvents(prev?.apple, apple), baseline);
  await sendGroup('Android', googleEvents(prev?.google, google), baseline);

  const changed = baseline || !isDeepStrictEqual(prev, next);
  if (changed && !args['dry-run']) {
    await mkdir(dirname(args.state), { recursive: true });
    await writeFile(args.state, `${JSON.stringify(next, null, 2)}\n`);
  }
  log(changed ? 'state changed' : 'no change', JSON.stringify(next));
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `changed=${changed && !args['dry-run']}\n`);
}

main().catch((e) => {
  console.error('[store-status] unexpected failure:', e);
  process.exit(1);
});
