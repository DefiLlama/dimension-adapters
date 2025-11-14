import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * Fetch data for CHAIN.GATE
 * This endpoint requires a date parameter to request data for a single date
 */
async function fetchGateData(dateString: string): Promise<any> {
  const endpointWithDate = `https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama?date=${dateString}&broker=gate`;

  const data = await httpGet(endpointWithDate);

  if (!data) {
    throw new Error("Data missing for date: " + dateString);
  }

  return {
    dailyVolume: data.volume,
  };
}

const methodology = {};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.GATE]: {
      start: "2025-10-15",
      fetch: async (options: FetchOptions) => {
        return fetchGateData(options.dateString);
      },
    },
  },
  methodology,
};

export default adapter;
