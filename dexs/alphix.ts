import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SWAP_TOPIC =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

type ChainConfig = {
  poolManager: string;
  pools: { id: string; token: string }[];
};

const config: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    pools: [
      {
        id: "0x71c06960eee8003ebf3f869caa480d7032c7088850d951f04de5b46d86ada017",
        token: "0x4200000000000000000000000000000000000006", // WETH
      },
      {
        id: "0xaf9168a5026bd5e398863dc1d0a0513fe21417792f9df4889571fd68d2d8cd71",
        token: "0x820c137fa70c8691f0e44dc420a5e53c168921dc", // USDS
      },
    ],
  },
  [CHAIN.ARBITRUM]: {
    poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
    pools: [
      {
        id: "0xe2c28a234aadc40f115dcc56b70a759d02a372db90dfeed19048392d942ee286",
        token: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
      },
    ],
  },
};

function decodeInt128(hex: string): bigint {
  const val = BigInt(hex);
  return val >= 1n << 127n ? val - (1n << 128n) : val;
}

async function fetch(options: FetchOptions) {
  const chainCfg = config[options.chain];
  const dailyVolume = options.createBalances();

  for (const pool of chainCfg.pools) {
    const logs = await sdk.getEventLogs({
      chain: options.chain,
      target: chainCfg.poolManager,
      fromBlock: Number(options.fromApi.block),
      toBlock: Number(options.toApi.block),
      topics: [SWAP_TOPIC, pool.id],
      entireLog: true,
    });

    for (const log of logs) {
      const data = log.data.slice(2);
      const amount0 = decodeInt128("0x" + data.slice(32, 64));
      const absAmount0 = amount0 > 0n ? amount0 : -amount0;
      dailyVolume.add(pool.token, absAmount0);
    }
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-02-10",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2026-03-07",
    },
  },
  doublecounted: true,
};

export default adapter;
