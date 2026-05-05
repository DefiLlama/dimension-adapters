import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const API_URL = "https://api.cubee.ee/api/defillama/dimensions";

interface DimensionsResponse {
  start: number;
  end: number;
  dailyVolume: number;
  dailyFees: number;
  dailySupplySideRevenue: number;
}

const fetch = async (options: FetchOptions) => {
  const url = `${API_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const data: DimensionsResponse = await httpGet(url);

  if (
    !data ||
    data.dailyVolume == null ||
    data.dailyFees == null ||
    data.dailySupplySideRevenue == null
  ) {
    throw new Error(
      `Cubic API returned invalid response from ${url}: ${JSON.stringify(data)}`
    );
  }

  const dailyRevenue = data.dailyFees - data.dailySupplySideRevenue;

  return {
    dailyVolume: data.dailyVolume,
    dailyFees: data.dailyFees,
    dailyUserFees: data.dailyFees,
    dailyRevenue,
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
    Revenue: "Protocol's share of swap fees on Cubic pools (dailyFees - dailySupplySideRevenue), accruing to the Cubic protocol fees authority.",
    SupplySideRevenue: "LPs' share of swap fees on Cubic pools.",
  },
};

export default adapter;
