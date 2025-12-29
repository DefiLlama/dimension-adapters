import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://axelar-bridge-connector-backend-main.babybulldog.xyz/lama-api";

const chainIds: Record<string, string> = {
  [CHAIN.BSC]: "56",
  [CHAIN.BASE]: "8453",
};

const fetch = async (options: FetchOptions) => {
  const chainId = chainIds[options.chain];
  const data = await httpGet(`${API_BASE}/volume?chain_id=${chainId}`);

  return {
    dailyBridgeVolume: data.dailyVolume || 0,
    totalBridgeVolume: data.totalVolume || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
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


