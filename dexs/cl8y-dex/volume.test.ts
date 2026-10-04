import assert from "node:assert/strict";
import { test } from "node:test";
import { getDailyVolume } from "./volume";

const day = 1790208000;
const date = "2026-09-24";
/** Build a daily-feed fixture for the September 24 reporting window. */
const daily = (volume_usd: unknown = null, trade_count = 28) => ({
  timestamp: day, date, volume_usd, trade_count,
});
/** Build the matching UTC protocol-series fixture used by fallback tests. */
const series = (volume_usd: unknown = "558.46100505072907764200", trade_count = 28) => ({
  grain: "daily", timezone: "UTC", methodology: "protocol_catalog",
  series: [{ utc_day: date, volume_usd, trade_count }],
});
/** Route mocked HTTP responses and record requests to verify fallback eligibility. */
function source(feed: any, fallback: any = series()) {
  const calls: string[] = [];
  return {
    calls,
    get: async (url: string) => {
      calls.push(url);
      return url.includes("/defillama/daily?") ? feed : fallback;
    },
  };
}

test("September 24 legacy null recovers only the positive priced lower bound", async () => {
  const { get, calls } = source(daily());
  assert.equal(await getDailyVolume(day, date, get), 558.4610050507291);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /grain=daily&limit=90$/);
});

test("priced and idle daily responses need no fallback", async () => {
  for (const [amount, trades] of [["123.45", 10], ["0", 0]] as const) {
    const { get, calls } = source(daily(amount, trades));
    assert.equal(await getDailyVolume(day, date, get), Number(amount));
    assert.equal(calls.length, 1);
  }
});

test("gem or other extra swaps prevent the broader series from being used", async () => {
  const { get } = source(daily(), series("600", 29));
  await assert.rejects(getDailyVolume(day, date, get), /identical trade count/);
});

test("missing, all-unpriced and active zero days never become zero", async () => {
  for (const fallback of [series(null), series("0"), { ...series(), series: [] }]) {
    await assert.rejects(getDailyVolume(day, date, source(daily(), fallback).get));
  }
  await assert.rejects(getDailyVolume(day, date, source(daily("0")).get), /no priced volume/);
});

test("reject wrong dates, duplicate dates, non-UTC series and malformed amounts", async () => {
  for (const feed of [
    { ...daily(), timestamp: day + 86400 }, { ...daily(), date: "2026-09-25" },
    { ...daily(), trade_count: "28" }, daily(""), daily(false), daily([]),
    daily(-1), daily("NaN"), daily("Infinity"), { ...daily(), volume_usd: undefined },
  ]) {
    await assert.rejects(getDailyVolume(day, date, source(feed).get));
  }
  for (const fallback of [
    { ...series(), timezone: "local" }, { ...series(), grain: "monthly" },
    { ...series(), methodology: "other" },
    { ...series(), series: [series().series[0], series().series[0]] },
    { ...series(), series: [{ ...series().series[0], utc_day: "2026-09-23" }] },
    series(false), series(""), series(-1),
  ]) {
    await assert.rejects(getDailyVolume(day, date, source(daily(), fallback).get));
  }
});

test("HTTP failures propagate instead of being recorded as zero", async () => {
  await assert.rejects(getDailyVolume(day, date, async () => { throw new Error("404"); }), /404/);
  await assert.rejects(getDailyVolume(day, date, async (url) => {
    if (url.includes("/defillama/")) return daily();
    throw new Error("503");
  }), /503/);
});

test("non-decimal numeric strings are rejected in both feed and fallback", async () => {
  for (const amount of ["0x10", "0b10", "0o10", "1_000", "1,000", "16 USD"]) {
    const primary = source(daily(amount));
    await assert.rejects(getDailyVolume(day, date, primary.get), /unpriced or missing/);
    assert.equal(primary.calls.length, 1);
    await assert.rejects(getDailyVolume(day, date, source(daily(), series(amount)).get), /matching priced volume/);
  }
});

test("decimal scientific notation remains valid", async () => {
  assert.equal(await getDailyVolume(day, date, source(daily("1.2345e2")).get), 123.45);
  assert.equal(await getDailyVolume(day, date, source(daily(), series("5.58461005e2")).get), 558.461005);
});
