/** Invalid-chain rejection must list top-level configured chains without any RPC calls. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
const root=path.resolve(__dirname,'..');
const result=spawnSync(process.execPath,[require.resolve('ts-node/dist/bin.js'),'--transpile-only','cli/testAdapter.ts','aggregators','tristero','2026-10-04','not-a-real-chain'],{cwd:root,encoding:'utf8',timeout:30000});
assert.ifError(result.error);
assert.notEqual(result.status,0);
const output=result.stdout+result.stderr;
assert.match(output,/has no chain\(s\): not-a-real-chain/);
assert.match(output,/Available: [^\n]*base/);
assert.match(output,/Available: [^\n]*ethereum/);
// A temporary top-level-only adapter exercises successful validation without RPCs.
// deadFrom exits after the chain acceptance check; fetch must never be reached.
const slug = `cli-chain-filter-fixture-${process.pid}`;
const fixture = path.join(root,'aggregators',slug+'.ts');
try {
  fs.writeFileSync(fixture, `export default { version: 2, chains: ['base'], start: '1999-01-01', deadFrom: '2000-01-01', fetch: () => { throw new Error('UNEXPECTED_FETCH'); } };`, {flag:'wx'});
  const accepted=spawnSync(process.execPath,[require.resolve('ts-node/dist/bin.js'),'--transpile-only','cli/testAdapter.ts','aggregators',slug,'2026-10-04','base'],{cwd:root,encoding:'utf8',timeout:30000});
  assert.ifError(accepted.error);
  assert.equal(accepted.status,0,accepted.stdout+accepted.stderr);
  assert.match(accepted.stdout,/Running only these chains: base/);
  assert.match(accepted.stdout,/deadFrom 2000-01-01.*skipping run/);
  assert.doesNotMatch(accepted.stdout+accepted.stderr,/UNEXPECTED_FETCH/);
} finally {
  fs.rmSync(fixture,{force:true});
}
console.log('PASS: CLI accepts configured top-level chains and rejects unknown chains without network fetch.');
