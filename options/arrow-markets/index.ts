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
  // api-rfq-testnet.prd.arrowmarkets.info is NXDOMAIN and the arrowmarkets.info apex resolves
  // with no A record. It was also a testnet host, which is why every recent day it did answer
  // came back as 0. Last non-zero 2026-05-23 ($26), TVL 0.
  deadFrom: '2026-08-07',
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
