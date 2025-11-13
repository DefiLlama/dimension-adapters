import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const GATE_LAYER_ENDPOINT =
  "https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama";

/**
 * Fetch data for CHAIN.GATE_LAYER
 * This endpoint requires a date parameter to request data for a single date
 */
async function fetchGateData(dateString: string): Promise<any> {
  const endpointWithDate = `${GATE_LAYER_ENDPOINT}?date=${dateString}`;

  const data = await httpGet(endpointWithDate);

  if (!data) {
    throw new Error("Data missing for date: " + dateString);
  }

  return {
    dailyVolume: data.volume,
    dailyFees: data.fees,
    dailyRevenue: data.fees,
    dailyProtocolRevenue: data.fees,
    dailyHoldersRevenue: 0,
  };
}

const methodology = {
  Fees: "Builder Fees collected from Gate Layer Network(0.4 bps on taker volume)",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue go to the protocol",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.GATE_LAYER]: {
      start: "2025-10-15",
      fetch: async (_: any, _1: any, { dateString }: FetchOptions) => {
        return fetchGateData(dateString);
      },
    },
  },
  methodology,
};

export default adapter;
