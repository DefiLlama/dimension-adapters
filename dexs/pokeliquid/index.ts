import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API = "https://pokeliquid.xyz/api/keeper";

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL(`${API}/daily-volume?date=${options.dateString}`);
  return {
    dailyVolume: res.dailyVolume,
    dailyFees: res.dailyFees,
    dailyRevenue: res.dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-01",
};

export default adapter;
