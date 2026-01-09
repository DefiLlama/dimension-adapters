import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://defillama-bsc-ton-bridge-backend-main.babybulldog.xyz";

const chainIds: Record<string, string> = {
  [CHAIN.BSC]: "56",
  [CHAIN.TON]: "ton_0",
};

const fetch = async (options: FetchOptions) => {
  const chainId = chainIds[options.chain];
  const data = await httpGet(`${API_BASE}/fees?chain_id=${chainId}`);

  return {
    dailyFees: data.dailyFees || 0,
    totalFees: data.totalFees || 0,
    dailyRevenue: data.dailyFees || 0,
    totalRevenue: data.totalFees || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2024-01-01",
    },
    [CHAIN.TON]: {
      fetch,
      start: "2024-01-01",
    },
  },
};

export default adapter;


