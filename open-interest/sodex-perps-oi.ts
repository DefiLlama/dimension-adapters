import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://data-api.sodex.com/api/defillama";

const fetch = async (options: FetchOptions) => {
  const res = await httpGet(`${API_BASE}/perp/open-interest?timestamp=${options.startOfDay}`);

  // The endpoint equals the sum of mark-prices openInterest x markPrice, which counts both sides: isolated
  // fills moved it by exactly 2x the fill size (182 windows, 1 at 1x; measured 2026-09-23).
  return {
    openInterestAtEnd: res.openInterestAtEnd / 2,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.VALUECHAIN],
  start: "2025-10-20",
};

export default adapter;
