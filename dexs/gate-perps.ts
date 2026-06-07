import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

/**
 * Fetch data for CHAIN.GATE_LAYER
 * This endpoint requires a date parameter to request data for a single date
 */
async function fetch(options: FetchOptions): Promise<any> {
  const endpointWithDate = `https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama?date=${options.dateString}&broker=gate`;

  const data = await httpGet(endpointWithDate);

  if (!data) {
    throw new Error("Data missing for date: " + options.dateString);
  }

  return {
    dailyVolume: data.volume,
  };
}

const methodology = {};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.GATE_LAYER],
  start: "2025-10-15",
  methodology,
};

export default adapter; 