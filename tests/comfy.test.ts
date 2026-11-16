import assert from "node:assert/strict";
import { test } from "node:test";
import { Balances, ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchResultV2 } from "../adapters/types";
import adapter from "../dexs/comfy";
import feeAdapter from "../fees/comfy";
import { DefaultDexTokensBlacklisted } from "../helpers/lists";

const NATIVE = "0x0000000000000000000000000000000000000000";
const TOKEN = "0x1111111111111111111111111111111111111111";
const USDC = "0x1f3aa82227281ca364bfb3d253b0f1af1da6473e";
const W0G = "0x1cd0690ff9a693f5ef2dd976660a8dafc81a109c";
const MANAGER = "0xaabd31f24914b48daea998e69683225e289d08b0";
const HOOK = "0x809acd73ac30b4e2d2dfd7d35b1fda850dcd4334";
const SPLITTER = "0x500acfbb2199d35ab1aa87736665d76c56bf633e";
const FIRST = 45552900;
type Event = {
  name: string; target: string; block: number;
  args: Record<string, string | bigint | boolean>;
};

function pool(id = "launch", currency0 = NATIVE, currency1 = TOKEN, hooks = HOOK): Event {
  return { name: "Initialize", target: MANAGER, block: FIRST - 10, args: { id, currency0, currency1, hooks } };
}

function split(poolId = "launch", protocolBps = 2000n): Event {
  return { name: "PoolConfigured", target: SPLITTER, block: FIRST - 9, args: { poolId, protocolBps, creatorBps: 10_000n - protocolBps } };
}

function swap(amount0: bigint, amount1: bigint, fee = 0n, protocolFee = 0n, id = "launch", block = FIRST): Event {
  return { name: "Swap", target: MANAGER, block, args: { id, amount0, amount1, fee, protocolFee } };
}

function charge(baseFee: bigint, openingFee: bigint, creatorTax: bigint, isBuy = true, poolId = "launch", block = FIRST, currency = NATIVE): Event {
  return { name: "ChargeTaken", target: HOOK, block, args: { poolId, currency, isBuy, baseFee, openingFee, creatorTax } };
}

function options(events: Event[], from = FIRST, to = FIRST + 1): FetchOptions {
  const api = new ChainApi({ chain: "0g", block: to });
  const getFromBlock = async () => from;
  const getToBlock = async () => to;
  return {
    chain: "0g", api, fromApi: new ChainApi({ chain: "0g", block: from }), toApi: api,
    createBalances: () => new Balances({ chain: "0g" }),
    getBlock: async () => { throw new Error("Unexpected block lookup"); },
    getFromBlock, getToBlock, getStartBlock: getFromBlock, getEndBlock: getToBlock,
    startTimestamp: 1790639972, endTimestamp: 1790643572,
    fromTimestamp: 1790639972, toTimestamp: 1790643571, startOfDay: 1790553600,
    dateString: "2026-09-28", moduleUID: "comfy-test",
    streamLogs: async () => { throw new Error("Unexpected indexer lookup"); },
    getLogs: async params => {
      const name = params.eventAbi?.match(/^event (\w+)/)?.[1];
      return events.filter(event => event.name === name && event.target === params.target
        && event.block >= (params.fromBlock ?? from) && event.block <= (params.toBlock ?? to))
        .map(event => event.args);
    },
  };
}

async function run(events: Event[], from = FIRST, to = FIRST + 1) {
  assert.ok(adapter.fetch);
  return adapter.fetch(options(events, from, to));
}

function amount(result: FetchResultV2, metric: string, currency = NATIVE): bigint {
  const balances = result[metric];
  assert.ok(balances instanceof Balances);
  return BigInt(balances.getBalances()[`0g:${currency}`] ?? 0);
}

function assertAccounting(result: FetchResultV2, currencies = [NATIVE, TOKEN]) {
  for (const currency of currencies) {
    assert.equal(amount(result, "dailyFees", currency), amount(result, "dailyRevenue", currency) + amount(result, "dailySupplySideRevenue", currency));
    assert.equal(amount(result, "dailyRevenue", currency), amount(result, "dailyProtocolRevenue", currency));
  }
}

test("uses input-side core fee rates in both swap directions and counts hook charges once", async () => {
  const result = await run([
    pool(), split(),
    swap(-1000n, 50n, 500_000n, 1000n), charge(12n, 3n, 4n),
    swap(90n, -2000n, 600_000n, 1000n), charge(4n, 0n, 3n, false),
    { name: "Accrued", target: SPLITTER, block: FIRST, args: { baseFee: 19n, tax: 7n } },
    { name: "LegEarned", target: SPLITTER, block: FIRST + 1, args: { amount: 5000n } },
    { name: "LegClaimed", target: SPLITTER, block: FIRST + 1, args: { amount: 5000n } },
  ]);
  assert.equal(amount(result, "dailyVolume"), 1109n);
  assert.equal(amount(result, "dailyVolume", TOKEN), 0n);
  assert.equal(amount(result, "dailyFees"), 526n);
  assert.equal(amount(result, "dailyRevenue"), 4n);
  assert.equal(amount(result, "dailySupplySideRevenue"), 522n);
  assert.equal(amount(result, "dailyFees", TOKEN), 1200n);
  assert.equal(amount(result, "dailyRevenue", TOKEN), 2n);
  assert.equal(amount(result, "dailySupplySideRevenue", TOKEN), 1198n);
  assertAccounting(result);
});

test("uses each pool's immutable share and sends all creator fees to supply side", async () => {
  const result = await run([
    pool("zero"), split("zero", 0n), charge(100n, 20n, 30n, true, "zero"),
    pool("full"), split("full", 10_000n), charge(100n, 20n, 30n, true, "full"),
    pool("partial"), split("partial", 2500n), charge(100n, 20n, 30n, true, "partial"),
  ]);
  assert.equal(amount(result, "dailyFees"), 450n);
  assert.equal(amount(result, "dailyRevenue"), 150n);
  assert.equal(amount(result, "dailySupplySideRevenue"), 300n);
  assertAccounting(result);
});

test("adds buy charges to gross quote volume for repeated swaps without adding sell charges", async () => {
  const result = await run([
    pool(), split(),
    charge(10n, 1n, 2n), swap(-87n, 200n),
    swap(-200n, 300n), charge(20n, 2n, 3n),
    swap(50n, -75n), charge(2n, 1n, 1n, false),
  ]);
  assert.equal(amount(result, "dailyVolume"), 375n);
  assert.equal(amount(result, "dailyFees"), 42n);
});

test("prefers a priced quote currency on listed ERC20 pairs", async () => {
  const result = await run([
    pool("stable", USDC, TOKEN, NATIVE), swap(-200n, 199n, 1000n, 0n, "stable"),
    pool("wrapped", TOKEN, W0G, NATIVE), swap(-100n, 50n, 0n, 0n, "wrapped"),
  ]);
  assert.equal(amount(result, "dailyVolume", USDC), 200n);
  assert.equal(amount(result, "dailyVolume", W0G), 50n);
  assert.equal(amount(result, "dailyVolume", TOKEN), 0n);
});

test("hourly partitions produce the same raw balances as one combined interval", async () => {
  const events = [pool(), split("launch", 3333n),
    swap(-10n, 1n, 333_333n, 1234n), charge(1n, 1n, 1n),
    swap(-10n, 1n, 333_333n, 1234n, "launch", FIRST + 1), charge(1n, 1n, 1n, true, "launch", FIRST + 1)];
  const together = await run(events);
  const first = await run(events, FIRST, FIRST);
  const second = await run(events, FIRST + 1, FIRST + 1);
  for (const metric of Object.keys(together)) {
    for (const currency of [NATIVE, TOKEN])
      assert.equal(amount(together, metric, currency), amount(first, metric, currency) + amount(second, metric, currency));
  }
});

test("discovers historical configurations before the interval and excludes later events", async () => {
  const futurePool = { ...pool("future"), block: FIRST + 2 };
  const result = await run([pool(), split(), swap(-10n, 5n), futurePool, swap(-900n, 5n, 0n, 0n, "future", FIRST + 2)]);
  assert.equal(amount(result, "dailyVolume"), 10n);
});

test("returns zero only for a valid empty interval or a period before deployment", async () => {
  for (const result of [await run([pool(), split()]), await run([], 1, 2)]) {
    for (const metric of Object.keys(result)) assert.equal(amount(result, metric), 0n);
  }
});

test("fails when required pool or split data is missing", async () => {
  await assert.rejects(run([swap(-10n, 5n)]), /missing its Initialize event/);
  await assert.rejects(run([pool(), charge(1n, 0n, 0n)]), /missing its PoolConfigured event/);
  await assert.rejects(run([pool("launch", NATIVE, TOKEN, NATIVE), split(), charge(1n, 0n, 0n)]), /does not match pool/);
  await assert.rejects(run([pool(), split(), charge(1n, 0n, 0n, true, "launch", FIRST, USDC)]), /does not match pool/);
});

test("propagates source failures instead of reporting zero", async () => {
  const request = options([]);
  request.getLogs = async () => { throw new Error("RPC unavailable"); };
  assert.ok(adapter.fetch);
  await assert.rejects(adapter.fetch(request), /RPC unavailable/);
});

test("applies the central blacklist to swaps and hook charges consistently", async () => {
  const original = DefaultDexTokensBlacklisted["0g"];
  DefaultDexTokensBlacklisted["0g"] = [TOKEN];
  try {
    const result = await run([pool(), split(), swap(-1000n, 100n, 3000n, 1000n), charge(10n, 10n, 10n)]);
    for (const metric of Object.keys(result)) assert.equal(amount(result, metric), 0n);
  } finally {
    if (original) DefaultDexTokensBlacklisted["0g"] = original;
    else delete DefaultDexTokensBlacklisted["0g"];
  }
});

test("registers the same hourly production adapter for fees and volume", () => {
  assert.equal(feeAdapter, adapter);
  assert.equal(adapter.version, 2);
  assert.equal(adapter.pullHourly, true);
  assert.deepEqual(adapter.chains, ["0g"]);
  assert.equal(adapter.start, "2026-09-28");
});
