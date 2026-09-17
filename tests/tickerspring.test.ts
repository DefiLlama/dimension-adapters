import assert from 'node:assert/strict';
import test from 'node:test';
import { Balances } from '@defillama/sdk';
import { FetchOptions } from '../adapters/types';
import lending from '../fees/tickerspring-lending';
import vaults from '../fees/tickerspring-vaults';
import { managedVaults } from '../fees/tickerspring-vaults/deployments';

const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const STOCK = '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35';
const ZERO = '0x0000000000000000000000000000000000000000';
const amount = (balance: Balances, token = USDG) => Object.entries(balance.getBalances()).filter(([key]) => key.toLowerCase() === `robinhood:${token.toLowerCase()}`).reduce((sum, [, value]) => sum + BigInt(value), 0n);
const createBalances = () => new Balances({ chain: 'robinhood' });
const identity = (result: any, token = USDG) => assert.equal(
  amount(result.dailyFees, token), amount(result.dailyRevenue, token) + amount(result.dailySupplySideRevenue, token),
);

type Pending = { interest: bigint; reserve: bigint };
async function runLending(before: Pending, after: Pending, logs: Pending[] = [], from = 63000000, to = 63001000) {
  const queries: any[] = [];
  const api = (state: Pending, block: number) => ({ call: async ({ abi }: any) => {
    assert.ok(block >= 62494078, 'must not call undeployed market');
    if (abi === 'uint256:reserves') return '123456789'; // Existing reserves are NOT fresh revenue.
    return { interest: state.interest, reserve: 123456789n + state.reserve, debt: 999999999n };
  } });
  const result = await lending.fetch!({
    createBalances, getFromBlock: async () => from, getToBlock: async () => to,
    fromApi: api(before, from), toApi: api(after, to),
    getLogs: async (query: any) => { queries.push(query); return logs.map(l => ({ interest: l.interest, reserveAdded: l.reserve })); },
  } as unknown as FetchOptions);
  return { result, queries };
}

test('idle lending accrues interest without requiring a borrower transaction', async () => {
  const { result } = await runLending({ interest: 100n, reserve: 10n }, { interest: 250n, reserve: 25n });
  assert.equal(amount(result.dailyFees as Balances), 150n);
  assert.equal(amount(result.dailyRevenue as Balances), 15n);
  identity(result);
});

test('lending checkpoints exclude carry-in and count only blocks after the opening snapshot', async () => {
  const { result, queries } = await runLending({ interest: 100n, reserve: 10n }, { interest: 20n, reserve: 2n }, [{ interest: 150n, reserve: 15n }]);
  assert.equal(amount(result.dailyFees as Balances), 70n);
  assert.equal(amount(result.dailyRevenue as Balances), 7n);
  assert.equal(queries.length, 1); // The v2/v3 API views are not distinct markets.
  assert.equal(queries[0].fromBlock, 63000001);
  identity(result);
});

test('lending deployment boundary uses zero opening accrual and never reads nonexistent code', async () => {
  const { result, queries } = await runLending({ interest: 99n, reserve: 99n }, { interest: 20n, reserve: 2n }, [], 62494000, 62495000);
  assert.equal(amount(result.dailyFees as Balances), 20n);
  assert.equal(queries[0].fromBlock, 62494078);
  identity(result);
});

test('recovery reverses forfeited uncheckpointed interest rather than silently flooring it', async () => {
  const { result } = await runLending({ interest: 100n, reserve: 10n }, { interest: 0n, reserve: 0n });
  assert.equal(amount(result.dailyFees as Balances), -100n);
  assert.equal(amount(result.dailySupplySideRevenue as Balances), -90n);
  identity(result);
});

const FIRST = managedVaults[0];
type VaultState = { harvested: bigint; pending: bigint; position?: string };
async function runVaults(before: VaultState, after: VaultState, logs: any[] = [], from = FIRST.deploymentBlock + 1000, to = FIRST.deploymentBlock + 2000) {
  const snapshots: string[] = [];
  const api = (state: VaultState) => ({ multiCall: async ({ abi, calls }: any) => calls.map((call: any) => {
    if (abi === 'address:position') return state.position ?? FIRST.vault;
    if (abi === 'address:token0') return USDG;
    if (abi === 'address:token1') return STOCK;
    if (abi.includes('grossFees')) return call.params[0] === 0 ? state.harvested : 0n;
    if (abi.includes('pendingFees')) { snapshots.push(call.target); return [state.pending, 0n]; }
    throw new Error(`Unexpected ABI ${abi}`);
  }) });
  const result = await vaults.fetch!({
    createBalances, getFromBlock: async () => from, getToBlock: async () => to,
    fromApi: api(before), toApi: api(after), getLogs: async (query: any) => {
      assert.equal(query.fromBlock, from + 1); return logs;
    },
  } as unknown as FetchOptions);
  return { result, snapshots };
}

test('harvesting already-accrued LP fees does not create income twice', async () => {
  const { result } = await runVaults({ harvested: 1000n, pending: 100n }, { harvested: 1100n, pending: 50n });
  assert.equal(amount(result.dailyFees as Balances), 50n);
  assert.equal(amount(result.dailyRevenue as Balances), 15n);
  assert.equal(amount(result.dailySupplySideRevenue as Balances), 35n);
  assert.equal(result.dailyHoldersRevenue, undefined, 'a buyback reserve is not a completed buyback');
  identity(result);
});

test('new vault snapshots cannot import a pre-deployment balance', async () => {
  const { result } = await runVaults({ harvested: 999n, pending: 999n }, { harvested: 10n, pending: 90n }, [], FIRST.deploymentBlock - 1, FIRST.deploymentBlock + 1);
  assert.equal(amount(result.dailyFees as Balances), 100n);
  identity(result);
});

test('unbound positions are supported and position migrations read each endpoint independently', async () => {
  const { result } = await runVaults({ harvested: 0n, pending: 999n, position: ZERO }, { harvested: 0n, pending: 20n });
  assert.equal(amount(result.dailyFees as Balances), 20n);
  const migrated = await runVaults({ harvested: 100n, pending: 20n, position: USDG }, { harvested: 120n, pending: 10n, position: STOCK });
  assert.deepEqual(migrated.snapshots, [USDG, STOCK]);
  assert.equal(amount(migrated.result.dailyFees as Balances), 10n);
});

test('legacy vaults use their emitted split and add no deposit principal', async () => {
  const { result } = await runVaults({ harvested: 0n, pending: 0n }, { harvested: 0n, pending: 0n }, [
    { grossFees: 1000n, protocolFees: 50n, buybackFunding: 150n, retainedForShareholders: 800n },
  ]);
  assert.equal(amount(result.dailyFees as Balances), 1000n);
  assert.equal(amount(result.dailyRevenue as Balances), 200n);
  identity(result);
});

test('adjacent windows preserve raw-unit fee and split totals without smoothing', async () => {
  const a = { harvested: 1n, pending: 3n }, b = { harvested: 4n, pending: 5n }, c = { harvested: 9n, pending: 12n };
  const ab = (await runVaults(a, b)).result, bc = (await runVaults(b, c)).result, ac = (await runVaults(a, c)).result;
  for (const key of ['dailyFees', 'dailyRevenue', 'dailySupplySideRevenue'])
    assert.equal(amount(ab[key] as Balances) + amount(bc[key] as Balances), amount(ac[key] as Balances));
});

test('RPC failures propagate instead of publishing false zero fees', async () => {
  await assert.rejects(vaults.fetch!({ createBalances, getFromBlock: async () => 64000000,
    getToBlock: async () => 64001000, fromApi: { multiCall: async () => { throw new Error('archive unavailable'); } },
  } as unknown as FetchOptions), /archive unavailable/);
});
