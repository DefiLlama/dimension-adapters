import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://data-api.sodex.com/api/defillama";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const res = await httpGet(`${API_BASE}/perp/open-interest?timestamp=${options.startOfDay}`);

  return {
    openInterestAtEnd: res.openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.VALUECHAIN],
  start: "2025-10-20",
};

export default adapter;
