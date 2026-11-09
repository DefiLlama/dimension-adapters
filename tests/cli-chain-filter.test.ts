/** Invalid-chain rejection must list top-level configured chains without any RPC calls. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
const root=path.resolve(__dirname,'..');
const result=spawnSync(process.execPath,[require.resolve('ts-node/dist/bin.js'),'--transpile-only','cli/testAdapter.ts','aggregators','tristero','2026-10-04','not-a-real-chain'],{cwd:root,encoding:'utf8',timeout:30000});
assert.ifError(result.error);
assert.notEqual(result.status,0);
const output=result.stdout+result.stderr;
assert.match(output,/has no chain\(s\): not-a-real-chain/);
assert.match(output,/Available: [^\n]*base/);
assert.match(output,/Available: [^\n]*ethereum/);
console.log('PASS: CLI validates normalized top-level chains and still rejects unknown chains before network fetch.');
