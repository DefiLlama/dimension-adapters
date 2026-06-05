import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://mainnet.analytics.tinyman.org/api/v1/general-statistics/"

interface IAPIResponse {
  total_liquidity_in_usd: string;
  last_day_total_volume_in_usd: string;
  last_day_algo_price_change: string;
};

const fetch = async (_: any) => {
  const response: IAPIResponse = (await fetchURL(URL));
  return {
    dailyVolume: `${response.last_day_total_volume_in_usd}`,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ALGORAND],
  runAtCurrTime: true,
};

export default adapter;
