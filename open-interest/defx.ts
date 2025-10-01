import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(
    "https://api.defx.com/v1/open/analytics/market/overview"
  );

  const openInterest = Number(response.data.openInterest || 0);

  return { openInterestAtEnd: openInterest };
};

const adapter: SimpleAdapter = {
  chains: [CHAIN.OFF_CHAIN],
  fetch,
  runAtCurrTime: true,
  start: "2025-10-01",
};

export default adapter;
