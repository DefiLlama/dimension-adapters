import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://data-api.sodex.com/api/defillama";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const timestamp = options.startOfDay;

  // Fetch spot and perp volume in parallel
  const [spotRes, perpRes] = await Promise.all([
    httpGet(`${API_BASE}/spot/volume?timestamp=${timestamp}`),
    httpGet(`${API_BASE}/perp/volume?timestamp=${timestamp}`),
  ]);

  const dailyVolume = (spotRes.dailyVolume || 0) + (perpRes.dailyVolume || 0);

  return {
    dailyVolume,
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
};

export default adapter;
