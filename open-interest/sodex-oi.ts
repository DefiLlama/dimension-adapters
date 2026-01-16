import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://data-api.sodex.com/api/defillama";

const fetch = async (options: FetchOptions) => {
  const timestamp = options.startOfDay;

  const res = await httpGet(`${API_BASE}/perp/open-interest?timestamp=${timestamp}`);

  return {
    openInterestAtEnd: res.openInterestAtEnd || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.VALUECHAIN],
  start: "2025-10-20",
};

export default adapter;
