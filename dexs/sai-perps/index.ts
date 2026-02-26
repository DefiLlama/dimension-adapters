import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const endpoint = `https://sai-api.nibiru.fi/dexpal/v1/stats`;

export async function fetch(_a: any, _b: any, options: FetchOptions) {
  const url = `${endpoint}?date=${options.dateString}`;
  const response: {
    accrued_trading_fees_24h: number;
    open_interest: number; // total (longs and shorts) open interest in USDs
    trading_volume_24h: number;
  } = await fetchURL(url);

  return {
    dailyVolume: response.trading_volume_24h,
    dailyFees: response.accrued_trading_fees_24h,
    openInterestAtEnd: response.open_interest,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.NIBIRU]: {
      fetch,
      start: "2026-01-01",
    },
  },
};

export default adapter;
