import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface ArrowMarketsVolumeResponse {
  daily_notional_volume: string;
  daily_premium_volume: string;
  total_notional_volume: string;
}

// endTime is in ms
export const arrowMarketsVolumeEndpoint = "https://api-rfq-testnet.prd.arrowmarkets.info/admin/volume"

export const v2_adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchArrowMarketsVolumeData,
      start: '2024-02-08'
    },
  },
};


export async function fetchArrowMarketsVolumeData(options: FetchOptions) {
  const ArrowMarketsVolumeData = await getArrowMarketsVolumeData(arrowMarketsVolumeEndpoint, options.endTimestamp);

  const dailyPremiumVolume = Number(ArrowMarketsVolumeData.daily_premium_volume ? ArrowMarketsVolumeData.daily_premium_volume : 0).toFixed(2);
  const dailyNotionalVolume = Number(ArrowMarketsVolumeData.daily_notional_volume ? ArrowMarketsVolumeData.daily_notional_volume : 0).toFixed(2);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

async function getArrowMarketsVolumeData(endpoint: string, timestamp: number): Promise<ArrowMarketsVolumeResponse> {
  const url = `${endpoint}?timestamp=${timestamp}`;
  return fetchURL(url)
}

export default v2_adapter;
