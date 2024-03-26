import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

const baseURL = "https://metrics-api.trusted-mainnet.elixir.finance/metrics/volume/cumulative";

const fetchVolumes = async (timestamp: number) => {
  const allVolumes = (
    await axios.get(`${baseURL}/${timestamp}`)
  ).data;

  return {
    totalVolume: allVolumes.total_volume ? `${Math.round(allVolumes.total_volume)}` : undefined,
    dailyVolume: allVolumes.daily_volume ? `${Math.round(allVolumes.daily_volume)}` : undefined,
    timestamp: timestamp,
  };
};

const startTime = 1698237367;

const adapter: BreakdownAdapter = {
  breakdown: {
    derivatives: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchVolumes,
        start: async () => startTime,
      },
    },
  },
};

export default adapter;
