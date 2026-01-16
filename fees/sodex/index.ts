import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://data-api.sodex.com/api/defillama";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const timestamp = options.startOfDay;

  // Fetch spot and perp fees in parallel
  const [spotRes, perpRes] = await Promise.all([
    httpGet(`${API_BASE}/spot/fees?timestamp=${timestamp}`),
    httpGet(`${API_BASE}/perp/fees?timestamp=${timestamp}`),
  ]);

  const dailyFees = (spotRes.dailyFees || 0) + (perpRes.dailyFees || 0);
  const dailyRevenue = (spotRes.dailyRevenue || 0) + (perpRes.dailyRevenue || 0);
  const dailyProtocolRevenue = (spotRes.dailyProtocolRevenue || 0) + (perpRes.dailyProtocolRevenue || 0);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.VALUECHAIN]: {
      fetch,
      start: "2025-10-20",
    },
  },
  methodology: {
    Fees: "Trading fees collected from spot and perpetual markets.",
    Revenue: "Protocol revenue after referral payouts.",
    ProtocolRevenue: "Revenue directed to the protocol treasury.",
  },
};

export default adapter;
