import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { FetchOptions, FetchV2 } from "../adapters/types";

const requests: string[] = [];
let respond: (url: URL) => unknown;
const fetchModule = require("../utils/fetchURL");
mock.method(fetchModule, "default", async (url: string) => {
  requests.push(url);
  return respond(new URL(url));
});
const { fetchOphisChainDay, fetchOphisProtocolDay, ophisChainConfig } = require("./ophis") as typeof import("./ophis");

const options = (chain: string, dateString: string) => ({ chain, dateString }) as FetchOptions;
const row = (chainId: number) => ({
  chainId, volumeUsd: 100, feesUsd: 1, revenueUsd: 0.75,
  supplySideRevenueUsd: 0.25, trades: 1, transactions: 1, users: 1,
});
const response = (date: string, chainIds: number[], chains = chainIds.map(row)) => ({
  ok: true, date, chainIds, chains,
  totals: {
    volumeUsd: chains.reduce((n, c) => n + c.volumeUsd, 0),
    feesUsd: chains.reduce((n, c) => n + c.feesUsd, 0),
    revenueUsd: chains.reduce((n, c) => n + c.revenueUsd, 0),
    supplySideRevenueUsd: chains.reduce((n, c) => n + c.supplySideRevenueUsd, 0),
    trades: chains.length, transactions: chains.length, users: chains.length ? 1 : 0,
  },
});

test("one chain's outage cannot poison another chain's daily cache", async () => {
  const date = "2026-11-03";
  let recovered = false;
  respond = (url) => {
    const ids = url.searchParams.get("chainIds")!.split(",").map(Number);
    const id = ids[0];
    if (id === 8453 && !recovered) throw new Error("HTTP 503: ingestion incomplete");
    return response(date, ids);
  };
  await assert.rejects(fetchOphisChainDay(options("base", date)), /503/);
  assert.equal((await fetchOphisChainDay(options("ethereum", date)))?.volumeUsd, 100);
  assert.equal((await fetchOphisChainDay(options("ethereum", date)))?.volumeUsd, 100);
  assert.equal(requests.filter((url) => new URL(url).searchParams.get("chainIds") === "1").length, 1);
  recovered = true;
  assert.equal((await fetchOphisChainDay(options("base", date)))?.chainId, 8453);
  assert.equal(requests.filter((url) => url.includes("chainIds=8453")).length, 2);
});

test("user totals deduplicate across exactly the configured reporting chains", async () => {
  const date = "2026-11-02";
  respond = (url) => {
    const ids = url.searchParams.get("chainIds")!.split(",").map(Number);
    assert.deepEqual(ids, Object.values(ophisChainConfig).map(c => c.id));
    return response(date, ids, [row(1), row(8453)]);
  };
  assert.equal((await fetchOphisProtocolDay(options("chain_global", date))).users, 1);
});

test("all configured volume, fee and user chains run without requesting unavailable Unichain", async () => {
  const volume = require("../aggregators/ophis").default;
  const fees = require("../fees/ophis").default;
  const users = require("../active-users/ophis").default;
  assert.equal(ophisChainConfig.unichain, undefined);
  respond = (url) => {
    const ids = url.searchParams.get("chainIds")!.split(",").map(Number);
    assert.ok(!ids.includes(130));
    return response(url.searchParams.get("date")!, ids);
  };
  for (const chain of Object.keys(ophisChainConfig)) {
    for (const [adapter, expected] of [[volume, [100]], [fees, [1, 0.75, 0.25]]] as const) {
      const amounts: number[] = [];
      await (adapter.fetch as FetchV2)({
        chain, dateString: "2026-10-29",
        createBalances: () => ({ addUSDValue: (value: number) => amounts.push(value) }),
      } as unknown as FetchOptions);
      assert.deepEqual(amounts, expected);
    }
  }
  for (const chain of Object.keys(ophisChainConfig)) {
    const value = await (users.fetch as FetchV2)(options(chain, "2026-10-29"));
    assert.equal(value.dailyActiveUsers, 1);
  }
  const all = await (users.fetch as FetchV2)(options("chain_global", "2026-10-29"));
  assert.equal(all.dailyActiveUsers, 1);
  assert.equal(all.dailyTransactionsCount, Object.keys(ophisChainConfig).length);
  const before = requests.length;
  await assert.rejects(fetchOphisChainDay(options("unichain", "2026-10-29")), /unsupported/);
  assert.equal(requests.length, before);
});

test("global source failure remains an error", async () => {
  respond = () => { throw new Error("HTTP 503: global history incomplete"); };
  await assert.rejects(fetchOphisProtocolDay(options("chain_global", "2026-11-01")), /503/);
});

test("an explicitly completed empty chain day is legitimate zero activity", async () => {
  respond = () => response("2026-10-31", [1], []);
  assert.equal(await fetchOphisChainDay(options("ethereum", "2026-10-31")), undefined);
});

test("expires successful responses so a later repair is rechecked", async () => {
  let now = Date.now();
  const clock = mock.method(Date, "now", () => now);
  const date = "2026-10-30";
  try {
    respond = () => response(date, [1]);
    assert.equal((await fetchOphisChainDay(options("ethereum", date)))?.volumeUsd, 100);
    respond = () => { throw new Error("HTTP 503: history requeued"); };
    now += 299_999;
    assert.equal((await fetchOphisChainDay(options("ethereum", date)))?.volumeUsd, 100);
    now += 1;
    await assert.rejects(fetchOphisChainDay(options("ethereum", date)), /503/);
    respond = () => response(date, [1], [{ ...row(1), volumeUsd: 200 }]);
    assert.equal((await fetchOphisChainDay(options("ethereum", date)))?.volumeUsd, 200);
  } finally {
    clock.mock.restore();
  }
});

for (const [index, bad] of [
  { chainIds: undefined },
  { chainIds: [130] },
  { chains: [row(130)] },
  { chains: [row(1), row(1)] },
  { chains: [{ ...row(1), volumeUsd: -1 }] },
  { totals: { ...response("unused", [1]).totals, feesUsd: 100 } },
].entries()) {
  test(`rejects incomplete, mixed-scope or inconsistent response ${index + 1}`, async () => {
    const date = `2026-10-${String(20 + index).padStart(2, "0")}`;
    respond = () => ({ ...response(date, [1]), ...bad });
    await assert.rejects(fetchOphisChainDay(options("ethereum", date)), /ophis:/);
  });
}
