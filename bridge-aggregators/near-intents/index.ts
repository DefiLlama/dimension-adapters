import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface ApiResponse {
  DATE: string;
  GROSS_AMOUNT_USD: number;
}

const api = "https://app.near-intents.org/api/stats/trading_volume"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await fetchURL(api)
  const dailyVolume = data.find((t: ApiResponse) => {
    const recordDate = t.DATE.split(' ')[0]
    return recordDate === options.dateString
  })?.GROSS_AMOUNT_USD
  return { dailyBridgeVolume: dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  start: '2024-11-05'
};

export default adapter;
