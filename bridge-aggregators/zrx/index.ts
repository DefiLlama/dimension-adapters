import asyncRetry from "async-retry";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";
const plimit = require("p-limit");

// Every chain is fetched at once but the stats API allows 5 requests per second per
// key, so requests are serialised and spaced to stay under the cap even if the API
// responds instantly.
const limits = plimit(1);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// originChainId query param: numeric chain id for EVM chains, lowercase name for non-EVM
const CHAINS: Record<string, number | string> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.POLYGON]: 137,
  [CHAIN.MONAD]: 143,
  [CHAIN.SONIC]: 146,
  [CHAIN.WC]: 480,
  [CHAIN.HYPERLIQUID]: 999, // HyperEVM; hypercore has no separate DefiLlama chain, so it is not counted
  [CHAIN.ABSTRACT]: 2741,
  [CHAIN.TEMPO]: 4217,
  [CHAIN.ROBINHOOD]: 4663,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.BASE]: 8453,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.INK]: 57073,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BERACHAIN]: 80094,
  [CHAIN.SCROLL]: 534352,
  // trades originating on non-EVM chains are not collected yet, enable once they are
  // [CHAIN.SOLANA]: "solana",
  // [CHAIN.TRON]: "tron",
};

async function getBridgeVolume(options: FetchOptions) {
  return asyncRetry(
    async () => {
      const response = await httpGet(
        `https://api.0x.org/stats/cross-chain/volume/daily?timestamp=${options.startOfDay}&originChainId=${CHAINS[options.chain]}`,
        {
          headers: {
            "0x-api-key": getEnv("AGGREGATOR_0X_API_KEY"),
          },
        },
      );

      await sleep(250);
      return response.data.volume;
    },
    { retries: 3, minTimeout: 1000, maxTimeout: 5000, factor: 2 },
  );
}

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = await limits(() => getBridgeVolume(options));

  return {
    dailyBridgeVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the stats API only serves daily aggregates keyed to UTC midnight
  fetch,
  chains: Object.keys(CHAINS),
  start: "2026-02-25",
  methodology: {
    BridgeVolume:
      "USD value of filled 0x cross-chain trades, attributed to the origin chain, as reported by the 0x stats API.",
  },
};

export default adapter;
