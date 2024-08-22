import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface ArrowMarketsVolumeResponse {
  total_notional_volume: string;
}

// endTime is in ms
export const arrowMarketsVolumeEndpoint = "https://api-rfq-testnet.prd.arrowmarkets.delivery/admin/volume"

export const v2_adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchArrowMarketsVolumeData,
      start: 1702630075
    },
  },
};

export async function fetchArrowMarketsVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  let timestamp_in_ms = timestamp * 1000
  const ArrowMarketsVolumeData = await getArrowMarketsVolumeData(arrowMarketsVolumeEndpoint);

  const totalNotionalVolume = Number(ArrowMarketsVolumeData.total_notional_volume).toFixed(2);

  return {
    timestamp,
    totalNotionalVolume,
  };
}

async function getArrowMarketsVolumeData(endpoint: string): Promise<ArrowMarketsVolumeResponse> {
  return fetchURL(endpoint)
}

export default v2_adapter;
