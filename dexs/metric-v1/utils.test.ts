import assert from "node:assert/strict";
import { test } from "node:test";
import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { importAdapter } from "../../adapters/utils/importAdapter";
import coreAssets from "../../helpers/coreAssets.json";
import adapter from "./index";

const currentFactory = "0x2a53833cc95548cf52c7b159110e22d3a9018f32";
const retiredFactory = "0x622911384e7973439b8be305f5e3fc3c5736ede4";
const token0 = coreAssets.ethereum.USDC.toLowerCase();
const token1 = coreAssets.ethereum.WETH.toLowerCase();

test("the public loader imports the live Metric V1 adapter", async () => {
  const result = await importAdapter("dexs", "metric-v1", __dirname);
  assert.equal(result.source, "file");
  assert.equal(result.adapter, adapter);
  assert.equal(adapter.version, 2);
  assert.equal(adapter.pullHourly, true);
  assert.equal(adapter.deadFrom, undefined);
  assert.equal(Object.keys(adapter.adapter!).length, 10);
});

for (const [date, expectedFactories, expectedVolume] of [
  ["2026-09-21", [retiredFactory, currentFactory], 130],
  ["2026-09-22", [currentFactory], 100],
  ["2026-10-18", [currentFactory], 100],
] as const) {
  test(`preserves factory selection and single-sided volume on ${date}`, async () => {
    const dailyVolume = new Balances({ chain: "ethereum" });
    const discoveredFactories: string[] = [];
    const swapTargets: string[] = [];
    const options = {
      chain: "ethereum",
      fromTimestamp: Date.parse(`${date}T00:00:00Z`) / 1000,
      createBalances: () => dailyVolume,
      getLogs: async ({ targets, cacheInCloud }: { targets: string[]; cacheInCloud?: boolean }) => {
        if (cacheInCloud) {
          discoveredFactories.push(...targets.map((target) => target.toLowerCase()));
          return targets.map((address) => ({
            address,
            args: { poolAddress: address, token0, token1 },
          }));
        }
        swapTargets.push(...targets);
        return targets.map((target) => target === currentFactory
          ? [{ amountDeltas: (100n << 128n) | BigInt.asUintN(128, -50n) }]
          : [{ amount0Delta: -30n, amount1Delta: 15n }]);
      },
    } as unknown as FetchOptions;

    const result = await adapter.fetch!(options);
    assert.deepEqual(discoveredFactories, expectedFactories);
    assert.deepEqual(swapTargets, expectedFactories);
    assert.equal(result.dailyVolume, dailyVolume);
    assert.deepEqual(dailyVolume.getBalances(), { [`ethereum:${token0}`]: expectedVolume });
  });
}
