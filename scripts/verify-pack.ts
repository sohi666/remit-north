/**
 * CI gate for tax packs: every src/tax/packs/*.json must validate and pass its reference checks,
 * and versions must be unique per year. Run: npm run verify:pack
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePack } from '../src/tax/validate';

const dir = join(__dirname, '..', 'src', 'tax', 'packs');
let failed = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const v = validatePack(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  if (!v.ok) {
    failed++;
    console.error(`✗ ${f}: ${v.error}`);
  } else {
    if (`${v.pack.year}.json` !== f) {
      failed++;
      console.error(`✗ ${f}: file name must be ${v.pack.year}.json`);
    }
    console.log(`✓ ${f}: ${v.pack.version} (${v.pack.checks.length} reference checks)`);
  }
}
process.exit(failed ? 1 : 0);
