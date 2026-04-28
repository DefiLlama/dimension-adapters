import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://api.nano-labs.io";
const volumeEndpoint = (start: number, end: number) =>
  `${API_BASE}/v1/stats/volume?start=${start}&end=${end}`;

const methodology = {
  Volume: "Daily trade volume routed through NanoStack's cross-chain execution fabric.",
  Fees: "Fees collected at 8-15 bps per execution, varying by trade size.",
  Revenue: "All fees accrue to the NanoStack protocol treasury.",
};

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(
    volumeEndpoint(options.startOfDay, options.startOfDay + 86400)
  );

  return {
    dailyVolume: data.dailyVolume,
    dailyFees: data.dailyFees,
    dailyUserFees: data.dailyUserFees,
    dailyRevenue: data.dailyRevenue,
    dailyProtocolRevenue: data.dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-12-01",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-12-01",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2025-12-01",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2025-12-01",
    },
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-12-01",
    },
  },
  methodology,
};

export default adapter;
