import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const endpoint = "https://sai-api.nibiru.fi/dexpal/v1/stats";

export async function fetch(options: FetchOptions) {
  const url = `${endpoint}?date=${options.dateString}`;
  const response = await fetchURL(url);

  return {
    dailyVolume: response.trading_volume_24h || 0,
    dailyFees: response.accrued_trading_fees_24h || 0,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.NIBIRU]: {
      fetch,
      start: '2026-01-01',
    },
  },
};

export default adapter;
