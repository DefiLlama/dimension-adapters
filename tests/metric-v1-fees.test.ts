import assert from "node:assert/strict";
import test from "node:test";
import { Balances, ChainApi } from "@defillama/sdk";
import { AbiCoder } from "ethers";
import adapter from "../fees/metric-v1";
import samples from "./fixtures/metric-v1-base.json";

const pool = samples[0].pool;
const fromBlock = 52000000;
const config = (p: number, a: number, n: number, b: number) =>
  ({ protocolSpreadFeeE6: p, adminSpreadFeeE6: a, protocolNotionalFeeE8: n, adminNotionalFeeE8: b });
const log = (kind: string, args: any, index: number, address = pool) =>
  ({ kind, args, index, address, blockNumber: fromBlock });
const pair = (high: bigint, low: bigint) => (BigInt.asUintN(128, high) << 128n) | BigInt.asUintN(128, low);
const swap = (index: number, spread: bigint, notional: bigint, token0 = true) =>
  log("Swap", { amountDeltas: token0 ? pair(1n, -1n) : pair(-1n, 1n), platformFees: pair(spread, notional) }, index);
async function run(logs: ReturnType<typeof log>[], useFixtures = false, hasNotional = false) {
  const row = (addr: string) => samples.find(s => s.pool === addr)!;
  const opts: any = {
    chain: "base", getFromBlock: async () => fromBlock, getToBlock: async () => fromBlock + 10,
    createBalances: () => new Balances({ chain: "base" }),
    getLogs: async ({ eventAbi, target, noTarget, onlyArgs }: any) => {
      assert.equal(onlyArgs, false);
      const kind = /^event (\w+)/.exec(eventAbi)![1];
      if (kind === "BinSwapped") assert.equal(noTarget, true);
      else if (kind === "Swap") assert.equal(noTarget, undefined);
      else assert.equal(target.toLowerCase(), "0x2a53833cc95548cf52c7b159110e22d3a9018f32");
      return logs.filter(l => l.kind === kind);
    },
    api: { multiCall: async ({ abi, calls }: any) => calls.map((c: any) => {
      if (abi.includes("isPool")) return !!row(c.params[0]);
      if (abi.includes("poolFeeConfig")) {
        assert.ok(useFixtures, "unexpected closing rate read");
        const [p,a,n,b] = row(c.params[0]).cfg;
        return config(p,a,hasNotional ? 1 : n,b);
      }
      assert.ok(abi.includes("getImmutables"));
      const s = row(c);
      return { token0: s.t0, token1: s.t1, token0ScaleMultiplier: useFixtures ? s.s0 : 10,
        token1ScaleMultiplier: useFixtures ? s.s1 : 10 };
    }) },
  };
  // Even a bin with zero LP fees is emitted when a swap accrues a platform fee.
  if (!useFixtures) logs = [...logs, ...logs.filter(l => l.kind === "Swap").map(l => {
    const word = BigInt(l.args.platformFees);
    return log("BinSwapped", { binDeltas: l.args.amountDeltas, fees: (word >> 128n) + BigInt.asUintN(128, word) }, l.index, l.address);
  }),
    log("BinSwapped", { binDeltas: 1n, fees: pair(100n, 0n) }, 1, "unregistered")];
  return (adapter.fetch as any)(opts);
}
function check(result: any, token: string, lp: number, admin: number, protocol: number) {
  const key = "base:" + token;
  function close(actual: number, expected: number) {
    assert.ok(Math.abs((actual ?? 0) - expected) < 1e-9, `${actual} vs ${expected}`);
  }
  close(result.dailyFees.getBalances()[key], lp + admin + protocol);
  close(result.dailyRevenue.getBalances()[key], protocol);
  close(result.dailyProtocolRevenue.getBalances()[key], protocol);
  close(result.dailySupplySideRevenue.getBalances()[key], lp + admin);
  const breakdown = result.dailySupplySideRevenue.getBreakdownBalances();
  close(breakdown["Swap Fees To LPs"]?.getBalances()[key], lp);
  close(breakdown["Swap Fees To Pool Curators"]?.getBalances()[key], admin);
  assert.notEqual(result.dailyRevenue, result.dailyProtocolRevenue);
}

test("four captured Base receipts match independently decoded scaled amounts", async () => {
  const coder = AbiCoder.defaultAbiCoder();
  const logs = samples.flatMap(s => s.logs.map((l, i) => {
    const [, deltas, fees] = coder.decode(["uint256", "uint256", "uint256"], l.data);
    return log(l.kind, l.kind === "Swap" ? { amountDeltas: deltas, platformFees: fees } : { binDeltas: deltas, fees }, i, s.pool);
  }));
  // RPC fallback can repeat a boundary block when splitting a range.
  for (const hasNotional of [false, true]) {
    const out = await run([...logs, ...logs.slice(0, 2)], true, hasNotional);
    check(out, samples[0].t1, 147731.748676981130, 9272.514990379948, 27706.634764828326);
    check(out, samples[1].t1, 3787.107358251863, 0, 668.313063220899);
  }
});

test("opening-block updates split each leg at its own rate in log order", async t => {
  const archive = t.mock.method(ChainApi.prototype, "multiCall", async function(this: ChainApi) {
    assert.equal(this.block, fromBlock - 1);
    return [config(1, 1, 0, 1)];
  });
  const out = await run([
    swap(7, 5n, 2n, false),
    log("PoolAdminSpreadFeeUpdated", { pool, value: 0 }, 4),
    log("PoolProtocolNotionalFeeUpdated", { pool, value: 1 }, 5),
    swap(2, 1n, 4n), swap(3, 2n, 1n),
    log("BinSwapped", { binDeltas: pair(1n, -1n), fees: pair(6n, 0n) }, 0),
    log("BinSwapped", { binDeltas: pair(1n, -1n), fees: pair(7n, 0n) }, 1),
    log("BinSwapped", { binDeltas: 0n, fees: 0n }, 6),
    { ...swap(8, 100n, 20n), address: "unregistered" },
  ]);
  assert.equal(archive.mock.callCount(), 1);
  check(out, samples[0].t0, 1.3, 0.6, 0.2);
  check(out, samples[0].t1, 0, 0.1, 0.6);
});

const created = log("PoolCreated", { poolAddress: pool, spreadProtocolFeeE6: 0, adminSpreadFeeE6: 1,
  protocolNotionalFeeE8: 1, adminNotionalFeeE8: 0 }, 0);
const update = log("PoolProtocolSpreadFeeUpdated", { pool, value: 1 }, 2);
test("new pool starts with creation rates, then assigns the rounding remainder to protocol", async () => {
  const out = await run([created, swap(1, 3n, 0n), update, swap(3, 3n, 0n)]);
  check(out, samples[0].t0, 0, 0.4, 0.2);
});
test("rejects a positive fee with no configured recipient or ambiguous input", async () => {
  await assert.rejects(run([{ ...created, args: { ...created.args, adminSpreadFeeE6: 0 } }, swap(1, 1n, 0n), update]), /zero configured rates/);
  await assert.rejects(run([created, update, log("Swap", { platformFees: pair(1n, 0n), amountDeltas: pair(1n, 2n) }, 3)]), /Ambiguous input/);
});

test("rejects a receipt set missing a fee-bearing bin", async () => {
  const coder = AbiCoder.defaultAbiCoder();
  const sample = samples[0];
  const swapLog = sample.logs.find(l => l.kind === "Swap")!;
  const [, amountDeltas, platformFees] = coder.decode(["uint256", "uint256", "uint256"], swapLog.data);
  await assert.rejects(run([
    log("BinSwapped", { binDeltas: pair(-1n, 1n), fees: 0n }, 0),
    log("Swap", { amountDeltas, platformFees }, 1),
  ], true, true), /bin and swap platform fees disagree/);
});
