import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { FetchOptions } from "../adapters/types";
import * as http from "../utils/fetchURL";
import volumeAdapter from "../dexs/aftermath-fi-perp";
import oiAdapter from "../open-interest/aftermath-fi-perp";
import { getAftermathMarkets } from "./aftermath";
import coreAssets from "./coreAssets.json";

const market = {
  objectId: "0x05b5c3bea84c4b8f33cf592d899008336dcbae8c9c6c75b2f8e7b8f7878744c1",
  packageId: "0x3ec740df8428aa9c93aaef7f8cc1542ac3194fd014826b51bfe245346d64efc7",
  collateralCoinType: coreAssets.sui.USDC_CIRCLE,
  marketState: { openInterest: 0.25 },
  indexPrice: 80000,
};
const secondMarket = { ...market, objectId: `0x${"a".repeat(64)}` };
const day = Date.parse("2026-08-22");
const options = { startOfDay: day / 1000 } as FetchOptions;
const fetchVolume = volumeAdapter.adapter!.sui.fetch!;

afterEach(() => mock.restoreAll());

test("counts each production market's USD candle once with exact daily bounds", async () => {
  mock.method(http, "httpPost", async (url: string, body: any) => {
    if (url.endsWith("/all-markets")) return { markets: [market, secondMarket] };
    assert.equal(body.fromTimestamp, day);
    assert.equal(body.toTimestamp, day + 86400000);
    assert.equal(body.resolution, "1d");
    return { candles: [{ timestamp: day, volume: body.marketId === market.objectId ? 123.5 : 76.5 }] };
  });
  assert.deepEqual(await fetchVolume(options), { dailyVolume: 200 });
});

test("refuses legacy dates and unfinished days before making API calls", async () => {
  const request = mock.method(http, "httpPost", async () => { throw new Error("Unexpected request"); });
  await assert.rejects(fetchVolume({ startOfDay: Date.parse("2026-08-17") / 1000 } as FetchOptions), /legacy history/);
  mock.method(Date, "now", () => day + 3600000);
  await assert.rejects(fetchVolume(options), /not closed/);
  assert.equal(request.mock.callCount(), 0);
});

test("does not swallow a failed market request in PromisePool", async () => {
  mock.method(http, "httpPost", async (url: string, body: any) => {
    if (url.endsWith("/all-markets")) return { markets: [market, secondMarket] };
    if (body.marketId === secondMarket.objectId) throw new Error("Market API unavailable");
    return { candles: [{ timestamp: day, volume: 100 }] };
  });
  await assert.rejects(fetchVolume(options), /Market API unavailable/);
});

test("accepts a market with no historical fills without dropping other markets", async () => {
  mock.method(http, "httpPost", async (url: string, body: any) => {
    if (url.endsWith("/all-markets")) return { markets: [market, secondMarket] };
    if (url.endsWith("/order-history")) {
      assert.equal(body.beforeTimestampCursor, day + 86400000);
      return { orders: [] };
    }
    return { candles: body.marketId === market.objectId ? [{ timestamp: day, volume: 100 }] : [] };
  });
  assert.deepEqual(await fetchVolume(options), { dailyVolume: 100 });
});

test("missing candles with fills, or an entirely missing day, cannot become zero", async () => {
  let orders: any[] = [{ timestamp: day }];
  mock.method(http, "httpPost", async (url: string) => {
    if (url.endsWith("/all-markets")) return { markets: [market] };
    if (url.endsWith("/order-history")) return { orders };
    return { candles: [] };
  });
  await assert.rejects(fetchVolume(options), /Missing Aftermath candle for a trading day/);
  orders = [];
  await assert.rejects(fetchVolume(options), /Missing Aftermath daily candles for all markets/);
});

test("rejects null, negative, duplicate and wrong-day candles; accepts explicit zero", async () => {
  let candles: any[] = [];
  mock.method(http, "httpPost", async (url: string) => {
    if (url.endsWith("/all-markets")) return { markets: [market] };
    return { candles };
  });
  for (const invalid of [
    [{ timestamp: day, volume: null }], [{ timestamp: day, volume: -1 }],
    [{ timestamp: day + 86400000, volume: 5 }],
    [{ timestamp: day, volume: 5 }, { timestamp: day, volume: 5 }],
  ]) {
    candles = invalid;
    await assert.rejects(fetchVolume(options), /Invalid Aftermath daily candle/);
  }
  candles = [{ timestamp: day, volume: 0 }];
  assert.deepEqual(await fetchVolume(options), { dailyVolume: 0 });
});

test("rejects empty discovery, duplicates and legacy deployment IDs", async () => {
  let markets: any[] = [];
  mock.method(http, "httpPost", async () => ({ markets }));
  for (const invalid of [[], [market, market], [{ ...market, packageId: "0xlegacy" }]]) {
    markets = invalid;
    await assert.rejects(getAftermathMarkets());
  }
});

test("OI counts base-token contracts once, including paused markets, and rejects missing state", async () => {
  let markets: any[] = [{ ...market, active: false, contractSize: 0.000001 }];
  mock.method(http, "httpPost", async () => ({ markets }));
  const balance = { value: 0, addUSDValue(value: number) { this.value += value; } };
  const oiOptions = { createBalances: () => balance } as unknown as FetchOptions;
  await oiAdapter.fetch!(oiOptions);
  assert.equal(balance.value, 20000);
  markets = [{ ...market, marketState: { openInterest: 0 }, indexPrice: null }];
  await oiAdapter.fetch!(oiOptions);
  assert.equal(balance.value, 20000);
  for (const invalid of [
    { ...market, marketState: { openInterest: null } },
    { ...market, marketState: { openInterest: -1 } },
    { ...market, indexPrice: null }, { ...market, indexPrice: 0 },
  ]) {
    markets = [invalid];
    await assert.rejects(oiAdapter.fetch!(oiOptions), /Invalid Aftermath open interest/);
  }
  assert.equal(oiAdapter.runAtCurrTime, true);
  assert.equal(oiAdapter.start, undefined);
  assert.equal(oiAdapter.pullHourly, false);
});
