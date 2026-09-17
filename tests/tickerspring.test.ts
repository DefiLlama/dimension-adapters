import assert from 'node:assert/strict';
import test from 'node:test';
import { Balances, ChainApi } from '@defillama/sdk';
import { Interface, ZeroAddress } from 'ethers';
import { FetchOptions } from '../adapters/types';
import vaults from '../fees/tickerspring-vaults';
import { managedVaults } from '../fees/tickerspring-vaults/deployments';

const V3 = managedVaults[0], V4 = managedVaults.find(v => v.manager !== V3.manager)!;
const FROM = 64000000, TO = FROM + 100;
const amount = (balance: any, token = V3.token0) => Object.entries((balance as Balances).getBalances())
  .filter(([key]) => key.toLowerCase() === `robinhood:${token.toLowerCase()}`).reduce((sum, [, value]) => sum + BigInt(value as string), 0n);
const identity = (result: any, token = V3.token0) => assert.equal(amount(result.dailyFees, token), amount(result.dailyRevenue, token) + amount(result.dailySupplySideRevenue, token));
const tx = (n = 1) => `0x${n.toString(16).padStart(64, '0')}`;
const log = (event: string, address: string, args: any, index = 0, blockNumber = FROM + 1, transactionHash = tx()) =>
  ({ event, address, args, index, blockNumber, transactionHash });
const mint = (v = V3, id = 1, block = v.deploymentBlock + 1) => v.manager === V3.manager
  ? log('Transfer', v.manager, { from: ZeroAddress, to: v.position, tokenId: id }, 0, block, tx(0))
  : log('PositionReceiptCreated', v.manager, { adapter: v.position, id }, 0, block, tx(0));
const collect = (a = 100n, b = 50n, index = 1, v = V3, id = 1, block = FROM + 1) => log('Collect', v.manager, { tokenId: id, recipient: v.position, amount0: a, amount1: b }, index, block);
const decrease = (a = 1000n, b = 500n, index = 2, v = V3, id = 1) => log('DecreaseLiquidity', v.manager, { tokenId: id, amount0: a, amount1: b }, index);
const recovery = (v = V3, block = FROM + 1, hash = tx()) => log('RecoveryOpened', v.vault, {}, 5, block, hash);

function options(logs: any[], from = FROM, to = TO) {
  const queries: any[] = [];
  const noState = { call: () => { throw new Error('historical call forbidden'); }, multiCall: () => { throw new Error('historical multicall forbidden'); } };
  const opts = {
    chain: 'robinhood', createBalances: () => new Balances({ chain: 'robinhood' }),
    getFromBlock: async () => from, getToBlock: async () => to,
    api: noState, fromApi: noState, toApi: noState,
    getLogs: async (q: any) => {
      queries.push(q);
      const event = q.eventAbi.match(/^event (\w+)\(/)[1];
      const targets = (q.targets ?? [q.target]).map((v: string) => v.toLowerCase());
      return logs.filter(l => l.event === event && targets.includes(l.address.toLowerCase()) && l.blockNumber >= q.fromBlock && l.blockNumber <= q.toBlock)
        .filter(l => !q.topics || new Interface([q.eventAbi]).encodeFilterTopics('Transfer', [l.args.from, l.args.to])
          .every((topic, i) => topic === q.topics[i]));
    },
  } as unknown as FetchOptions;
  return { opts, queries };
}
async function run(logs: any[], from = FROM, to = TO, prefetched = false) {
  const { opts, queries } = options(logs, from, to);
  if (prefetched) opts.preFetchedResults = await vaults.prefetch!(opts);
  const result = await vaults.fetch!(opts);
  return { result, queries };
}

test('ordinary V3 harvest splits both native tokens 10/20/70 without historical state', async () => {
  const { result } = await run([mint(), collect()]);
  assert.equal(amount(result.dailyFees), 100n);
  assert.equal(amount(result.dailyRevenue), 30n);
  assert.equal(amount(result.dailySupplySideRevenue), 70n);
  assert.equal(amount(result.dailyFees, V3.token1), 50n);
  assert.equal(result.dailyHoldersRevenue, undefined);
  identity(result); identity(result, V3.token1);
});

test('V4 receipt discovery uses the same collection accounting', async () => {
  const { result } = await run([mint(V4), collect(200n, 100n, 1, V4)]);
  assert.equal(amount(result.dailyFees, V4.token0), 200n);
  assert.equal(amount(result.dailyRevenue, V4.token0), 60n);
  identity(result, V4.token0);
});

test('withdrawal principal is excluded without erasing the preceding harvest', async () => {
  const { result } = await run([mint(), collect(1000n, 500n, 3), decrease(), collect()]); // deliberately unsorted
  assert.equal(amount(result.dailyFees), 100n);
  assert.equal(amount(result.dailyFees, V3.token1), 50n);
  identity(result);
});

test('multiple harvest/remove cycles in one transaction preserve per-harvest rounding', async () => {
  const { result } = await run([mint(), collect(9n, 0n), decrease(), collect(1000n, 500n, 3), collect(9n, 0n, 4), decrease(30n, 40n, 5), collect(30n, 40n, 6)]);
  assert.equal(amount(result.dailyFees), 18n);
  assert.equal(amount(result.dailyRevenue), 2n); // two floors of 9/5; never floor the aggregate
  identity(result);
});

test('unrelated NFTs sent to a familiar collection recipient do not become vault fees', async () => {
  const { result } = await run([mint(), collect(99999n, 99999n, 1, V3, 99)]);
  assert.equal(amount(result.dailyFees), 0n);
});

test('receipt IDs are scoped to the manager, including V3/V4 ID collisions', async () => {
  const { result } = await run([mint(), mint(V4), collect(100n, 0n), collect(200n, 0n, 2, V4)]);
  assert.equal(amount(result.dailyFees, V3.token0), 100n + (V4.token0 === V3.token0 ? 200n : 0n));
  identity(result, V4.token0);
});

test('recovery transaction and later cross-day principal settlements are excluded', async () => {
  const { result } = await run([mint(), decrease(), recovery(), collect(1100n, 550n, 6),
    { ...collect(50000n, 0n, 1, V3, 1, FROM + 2), transactionHash: tx(2) }]);
  assert.equal(amount(result.dailyFees), 0n);
  const later = await run([mint(), recovery(V3, FROM - 10, tx(3)), collect(50000n, 0n)]);
  assert.equal(amount(later.result.dailyFees), 0n);
});

test('harvests before recovery in a different transaction of the same block are retained', async () => {
  const { result } = await run([mint(), collect(), recovery(V3, FROM + 1, tx(2))]);
  assert.equal(amount(result.dailyFees), 100n);
});

test('missing principal collections and inconsistent amounts fail instead of inflating fees', async () => {
  await assert.rejects(run([mint(), decrease()]), /uncollected withdrawal principal/);
  await assert.rejects(run([mint(), decrease(), collect(1001n, 500n, 3)]), /principal collection mismatch/);
});

test('unexpected recipients and missing ordering metadata fail loudly', async () => {
  const foreign = collect(); foreign.args.recipient = ZeroAddress;
  await assert.rejects(run([mint(), foreign]), /unexpected collection recipient/);
  await assert.rejects(run([mint(), { ...collect(), index: undefined }]), /missing log ordering metadata/);
});

test('new NFTs from rebalances are discovered while old burned receipt history stays attributable', async () => {
  const { result } = await run([mint(), mint(V3, 2, FROM + 2), collect(), collect(200n, 0n, 1, V3, 2, FROM + 3)]);
  assert.equal(amount(result.dailyFees), 300n);
});

test('prefetch and direct fetch agree; hourly boundaries conserve amounts and allocations', async () => {
  const logs = [mint(), collect(), collect(39n, 0n, 1, V3, 1, FROM + 50)];
  const all = (await run(logs, FROM, TO, true)).result;
  const first = (await run(logs, FROM, FROM + 50)).result, second = (await run(logs, FROM + 50, TO)).result;
  const direct = (await run(logs)).result;
  for (const field of ['dailyFees', 'dailyRevenue', 'dailySupplySideRevenue']) {
    assert.equal(amount(all[field]), amount(first[field]) + amount(second[field]));
    assert.equal(amount(all[field]), amount(direct[field]));
  }
});

test('idle periods return zero collected fees and the exact 18-vault deployment boundary is respected', async () => {
  assert.equal(managedVaults.length, 18);
  assert.equal(new Set(managedVaults.map(v => v.vault.toLowerCase())).size, 18);
  const before = await run([], V3.deploymentBlock - 10, V3.deploymentBlock - 1);
  assert.equal(before.queries.length, 0);
  assert.equal(amount(before.result.dailyFees), 0n);
  assert.equal(amount((await run([mint()])).result.dailyFees), 0n);
  const deployed = await run([mint(V3, 1, V3.deploymentBlock), collect(100n, 0n, 1, V3, 1, V3.deploymentBlock)], V3.deploymentBlock - 1, V3.deploymentBlock);
  assert.equal(amount(deployed.result.dailyFees), 100n);
});

test('invalid block windows fail before any logs or state are read', async () => {
  const invalid = [null, undefined, NaN, Infinity, -Infinity, 0, -1, 1.5, '64000000', Number.MAX_SAFE_INTEGER + 1];
  const windows = [...invalid.map(value => [value, TO]), ...invalid.map(value => [FROM, value]), [null, null], [TO, FROM], [FROM, FROM]];
  for (const [from, to] of windows) {
    const { opts, queries } = options([], from as number, to as number);
    opts.getFromBlock = async () => from as number; opts.getToBlock = async () => to as number;
    await assert.rejects(vaults.fetch!(opts), /invalid block window/);
    assert.equal(queries.length, 0);
  }
});

test('public log failures propagate rather than producing a false zero', async () => {
  const { opts } = options([]);
  opts.getLogs = async () => { throw new Error('public RPC unavailable'); };
  await assert.rejects(vaults.fetch!(opts), /public RPC unavailable/);
});

test('executed migrations discover new positions using only latest immutable metadata', async () => {
  const next = { ...V3, position: '0x0000000000000000000000000000000000001234', manager: V4.manager };
  const original = ChainApi.prototype.multiCall;
  const calls: string[] = [];
  ChainApi.prototype.multiCall = async function (q: any) {
    assert.equal(this.block, undefined, 'metadata calls must not be historical');
    calls.push(q.abi);
    const values: Record<string, string> = { 'address:manager': next.manager, 'address:vault': V3.vault, 'address:token0': V3.token0, 'address:token1': V3.token1 };
    return q.calls.map(() => values[q.abi]);
  };
  try {
    const proposed = log('MigrationProposed', V3.control, { digest: tx(10), position: next.position }, 0, FROM - 20, tx(10));
    const executed = log('MigrationExecuted', V3.control, { digest: tx(10) }, 0, FROM - 10, tx(11));
    const { result } = await run([mint(), proposed, executed, mint(next, 2, FROM - 5), collect(200n, 0n, 1, next, 2)]);
    assert.equal(amount(result.dailyFees), 200n);
    assert.equal(calls.length, 4);
    await assert.rejects(run([executed]), /missing migration proposal/);
  } finally { ChainApi.prototype.multiCall = original; }
});
