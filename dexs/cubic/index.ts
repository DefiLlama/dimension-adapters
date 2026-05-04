import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const API_URL = "https://api.cubee.ee/api/defillama/dimensions";

interface DimensionsResponse {
  start: number;
  end: number;
  dailyVolume: number;
  dailyFees: number;
  dailyRevenue: number;
  dailySupplySideRevenue: number;
  dailyUserFees: number;
  dailyProtocolRevenue: number;
}

const fetch = async (options: FetchOptions) => {
  const url = `${API_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const data: DimensionsResponse = await httpGet(url);

  return {
    dailyVolume: data.dailyVolume,
    dailyFees: data.dailyFees,
    dailyUserFees: data.dailyUserFees,
    dailyRevenue: data.dailyRevenue,
    dailyProtocolRevenue: data.dailyProtocolRevenue,
    dailySupplySideRevenue: data.dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-01-01",
    },
  },
  methodology: {
    Volume: "Sum of swap input USD value across all Cubic pools, computed from on-chain swap events indexed by the Cubic backend.",
    Fees: "All swap fees paid by users on Cubic pools (LP share + protocol share).",
    UserFees: "All swap fees paid by users on Cubic pools.",
    Revenue: "Protocol's share of swap fees on Cubic pools.",
    ProtocolRevenue: "Protocol's share of swap fees, accruing to the Cubic protocol fees authority.",
    SupplySideRevenue: "LPs' share of swap fees on Cubic pools.",
  },
  breakdownMethodology: {
    Fees: {
      "Swap Fees": "Fees collected on every swap, computed from on-chain swap events.",
    },
    Revenue: {
      "Swap Fees To Treasury": "Protocol's share of swap fees.",
    },
    SupplySideRevenue: {
      "Swap Fees To LPs": "LPs' share of swap fees.",
    },
  },
};

export default adapter;
