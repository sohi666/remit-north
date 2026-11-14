#!/usr/bin/env node
/**
 * One-time iOS signing setup for a new app on an existing Apple team, without an Apple ID login.
 *
 * `eas build --non-interactive` can create provisioning profiles with an App Store Connect API key, but it
 * refuses to pick a distribution certificate for an app that has none ("Failed to set up credentials").
 * This script does what `eas credentials` does interactively when you choose "reuse an existing certificate":
 *   1. finds the account's newest valid distribution certificate for the Apple team (already in EAS, e.g. Rotor's),
 *   2. creates an App Store provisioning profile for the bundle ID with the App Store Connect API,
 *   3. stores the profile in EAS and links certificate + profile to this app's production build credentials.
 * Idempotent: does nothing when the app already has App Store build credentials.
 *
 * Env: EXPO_TOKEN, ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY_PATH, APPLE_TEAM_ID, EAS_CLI_DIR (eas-cli package dir).
 */
const { createSign } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const app = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'app.json'), 'utf8')).expo;
const projectId = app.extra?.eas?.projectId;
const bundleIdentifier = app.ios.bundleIdentifier;
const teamId = process.env.APPLE_TEAM_ID || '3EJ7FPDYM4';
const easDir = process.env.EAS_CLI_DIR;
const need = ['EXPO_TOKEN', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_API_KEY_PATH', 'EAS_CLI_DIR'].filter((k) => !process.env[k]);
if (need.length || !projectId) {
  console.error(`missing: ${[...need, ...(projectId ? [] : ['expo.extra.eas.projectId'])].join(', ')}`);
  process.exit(2);
}
const req = (p) => require(path.join(easDir, 'build', p));
const { createGraphqlClient } = req('commandUtils/context/contextUtils/createGraphqlClient');
const { AppQuery } = req('graphql/queries/AppQuery');
const gql = req('credentials/ios/api/GraphqlClient');

// ---- App Store Connect API ----
function ascToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' });
  const body = b64({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key: readFileSync(process.env.ASC_API_KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}
async function asc(method, url, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${url}`, {
    method,
    headers: { Authorization: `Bearer ${ascToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ASC ${method} ${url}: HTTP ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 400)}`);
  return json;
}

(async () => {
  const client = createGraphqlClient({ accessToken: process.env.EXPO_TOKEN, sessionSecret: null });
  const project = await AppQuery.byIdAsync(client, projectId);
  const lookup = { account: project.ownerAccount, projectName: project.slug, bundleIdentifier };

  const existing = await gql.getIosAppCredentialsWithBuildCredentialsAsync(client, lookup, { iosDistributionType: 'APP_STORE' });
  const bc = existing?.iosAppBuildCredentialsList?.[0];
  if (bc?.distributionCertificate && bc?.provisioningProfile) {
    console.log(`iOS build credentials already set for ${bundleIdentifier}; nothing to do.`);
    return;
  }

  const appleTeam = await gql.createOrGetExistingAppleTeamAndUpdateNameIfChangedAsync(client, project.ownerAccount.id, { appleTeamIdentifier: teamId });
  const certs = (await gql.getDistributionCertificatesForAccountAsync(client, project.ownerAccount))
    .filter((c) => (!c.appleTeam || c.appleTeam.appleTeamIdentifier === teamId) && new Date(c.validityNotAfter) > new Date())
    .sort((a, b) => new Date(b.validityNotAfter) - new Date(a.validityNotAfter));
  if (!certs.length) throw new Error(`No valid distribution certificate for team ${teamId} in EAS. Run "npx eas-cli@latest credentials -p ios" once.`);

  // Match the EAS certificate to Apple's certificate record by serial number.
  const appleCerts = (await asc('GET', '/v1/certificates?limit=200')).data.filter((c) => /DISTRIBUTION/.test(c.attributes.certificateType));
  const norm = (s) => String(s).replace(/^0+/, '').toUpperCase();
  let cert, appleCert;
  for (const c of certs) {
    appleCert = appleCerts.find((a) => norm(a.attributes.serialNumber) === norm(c.serialNumber));
    if (appleCert) {
      cert = c;
      break;
    }
  }
  if (!cert) throw new Error('None of the EAS distribution certificates is still valid on the Apple Developer account.');
  console.log(`Reusing distribution certificate ${cert.serialNumber} (valid until ${cert.validityNotAfter}).`);

  // Bundle ID (registered by hand or by this script).
  let bundle = (await asc('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleIdentifier)}&limit=5`)).data.find((b) => b.attributes.identifier === bundleIdentifier);
  if (!bundle) {
    bundle = (await asc('POST', '/v1/bundleIds', { data: { type: 'bundleIds', attributes: { identifier: bundleIdentifier, name: app.name, platform: 'IOS' } } })).data;
    console.log(`Registered bundle ID ${bundleIdentifier}.`);
  }

  const profile = (
    await asc('POST', '/v1/profiles', {
      data: {
        type: 'profiles',
        attributes: { name: `*[expo] ${bundleIdentifier} AppStore ${new Date().toISOString().slice(0, 19)}`, profileType: 'IOS_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundle.id } },
          certificates: { data: [{ type: 'certificates', id: appleCert.id }] },
        },
      },
    })
  ).data;
  console.log(`Created App Store provisioning profile ${profile.id}.`);

  const appleAppIdentifier = await gql.createOrGetExistingAppleAppIdentifierAsync(client, lookup, appleTeam);
  const easProfile = await gql.createProvisioningProfileAsync(client, lookup, appleAppIdentifier, {
    appleProvisioningProfile: profile.attributes.profileContent,
    developerPortalIdentifier: profile.id,
  });
  await gql.createOrUpdateIosAppBuildCredentialsAsync(client, lookup, {
    appleTeam,
    appleAppIdentifierId: appleAppIdentifier.id,
    iosDistributionType: 'APP_STORE',
    appleProvisioningProfileId: easProfile.id,
    appleDistributionCertificateId: cert.id,
  });
  console.log(`iOS production credentials ready for ${bundleIdentifier}.`);
})().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
