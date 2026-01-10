import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://axelar-bridge-connector-backend-main.babybulldog.xyz/lama-api";
const API_TON = "https://defillama-bsc-ton-bridge-backend-main.babybulldog.xyz";
const API_SOL = "https://wormhole-bridge-defilama-connector-backend-main.babybulldog.xyz";

const chainIds: Record<string, string> = {
  [CHAIN.BSC]: "56",
  [CHAIN.SOLANA]: "sol_mainnet_beta",
  [CHAIN.BASE]: "8453",
  [CHAIN.TON]: "ton_0",
};

const apis: Record<string, string[]> = {
  [CHAIN.BSC]: [API_BASE, API_TON, API_SOL],
  [CHAIN.SOLANA]: [API_SOL],
  [CHAIN.BASE]: [API_BASE],
  [CHAIN.TON]: [API_TON],
};

const fetch = async (options: FetchOptions) => {
  const chainId = chainIds[options.chain];
  const apiList = apis[options.chain];

  let dailyVolume = 0;
  let totalVolume = 0;

  for (const api of apiList) {
    const data = await httpGet(`${api}/volume?chain_id=${chainId}`);
    dailyVolume += data.dailyVolume || 0;
    totalVolume += data.totalVolume || 0;
  }

  return {
    dailyBridgeVolume: dailyVolume,
    totalBridgeVolume: totalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2024-01-01",
    },
    [CHAIN.SOLANA]: {
      fetch,
      start: "2024-01-01",
    },
    [CHAIN.TON]: {
      fetch,
      start: "2024-01-01",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2024-01-01",
    },
  },
};

export default adapter;
