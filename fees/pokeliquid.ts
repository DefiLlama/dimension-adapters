import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://pokeliquid.xyz/api/v1";

const fetch = async (options: FetchOptions) => {
  const dateStr = options.dateString; // YYYY-MM-DD format

  const data = await httpGet(`${API_BASE}/daily-volume?date=${dateStr}`);

  const dailyVolume = data.dailyVolume || 0;
  const dailyFees = data.dailyFees || 0;

  // Fee split: 50% LP, 25% insurance, 25% protocol
  const dailySupplySideRevenue = dailyFees * 0.5;
  const dailyProtocolRevenue = dailyFees * 0.25;
  const dailyRevenue = dailyProtocolRevenue;

  return {
    dailyVolume: dailyVolume.toString(),
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue.toString(),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-05-20",
    },
  },
};

export default adapter;
