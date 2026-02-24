import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const endpoint = `https://sai-api.nibiru.fi/dexpal/v1/stats`;

export async function fetch(options: FetchOptions) {
  let url = `${endpoint}?date=${options.dateString}`;
  if (options.dateString.length === 0) {
    url = endpoint;
  } else if (options.dateString.split("-").length !== 3) {
    throw new Error(
      `invalid options.dateString "${options.dateString}" for ?date=YYYY-MM-DD parameter`,
    );
  }
  const response: {
    accrued_trading_fees_24h: number;
    accrued_trading_fees_all_time: number;
    open_interest: number; // total (longs and shorts) open interest in USD
    total_trades_24h: number;
    total_trades_all_time: number;
    total_users_24h: number;
    total_users_all_time: number;
    trading_volume_24h: number;
    trading_volume_all_time: number;
    // Fields omitted for historical queries (current only):
    // total_open_positions, tvl.
    total_open_positions?: number;
    tvl?: number;
  } = await fetchURL(url);

  return {
    dailyVolume: response.trading_volume_24h,
    dailyFees: response.accrued_trading_fees_24h,
    openInterestAtEnd: response.open_interest,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.NIBIRU]: {
      fetch,
      start: "2026-01-01",
    },
  },
};

export default adapter;
