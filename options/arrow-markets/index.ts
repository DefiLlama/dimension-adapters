import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface ArrowMarketsVolumeResponse {
  daily_notional_volume: string;
  daily_premium_volume: string;
  total_notional_volume: string;
}

// endTime is in ms
export const arrowMarketsVolumeEndpoint = "https://api-rfq-testnet.prd.arrowmarkets.delivery/admin/volume"

export const v2_adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchArrowMarketsVolumeData,
      start: 1707350400
    },
  },
};

export async function fetchArrowMarketsVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  const ArrowMarketsVolumeData = await getArrowMarketsVolumeData(arrowMarketsVolumeEndpoint, timestamp);

  const dailyPremiumVolume = Number(ArrowMarketsVolumeData.daily_premium_volume).toFixed(2);
  const dailyNotionalVolume = Number(ArrowMarketsVolumeData.daily_notional_volume).toFixed(2);
  const totalNotionalVolume = Number(ArrowMarketsVolumeData.total_notional_volume).toFixed(2);

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
    totalNotionalVolume,
  };
}

async function getArrowMarketsVolumeData(endpoint: string, timestamp: number): Promise<ArrowMarketsVolumeResponse> {
  const url = new URL(endpoint);
  url.searchParams.append('timestamp', timestamp.toString());
  
  return fetchURL(endpoint)
}

export default v2_adapter;
