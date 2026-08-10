import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

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

const fetch = async (options: FetchOptions) => {
  const response = await httpGet(
    `https://api.0x.org/stats/cross-chain/volume/daily?timestamp=${options.startOfDay}&originChainId=${CHAINS[options.chain]}`,
    {
      headers: {
        "0x-api-key": getEnv("AGGREGATOR_0X_API_KEY"),
      },
    },
  );

  return {
    dailyBridgeVolume: response.data.volume,
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
