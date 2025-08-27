import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface IMobyVolumeResponse {
  daily_notional_volume: string;
  daily_premium_volume: string;
  total_notional_volume: string;
  total_premium_volume: string;
}

// endTime is in ms
export const arb_mobyVolumeEndpoint = (endTime: number) => {
  return `https://lambda-api.moby.trade/getVolumeData?end_time=${endTime}`;
}

export const bera_mobyVolumeEndpoint = (endTime: number) => {
  return `https://lambda-bera-api.moby.trade/getVolumeData?end_time=${endTime}`;
}

export const moby_adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: arb_fetchMobyVolumeData,
      start: '2024-04-03'
    },
    [CHAIN.BERACHAIN]: {
      fetch: bera_fetchMobyVolumeData,
      start: '2025-02-08'
    }
  },
};

const _fetchMobyVolumeData = async (timestamp, endPoint) => {
  let timestamp_in_ms = timestamp * 1000
  const mobyVolumeData = await getMobyVolumeData(endPoint(timestamp_in_ms));

  const dailyNotionalVolume = Number(mobyVolumeData.daily_notional_volume).toFixed(2);
  const dailyPremiumVolume =  Number(mobyVolumeData.daily_premium_volume).toFixed(2);

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

export async function arb_fetchMobyVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  return await _fetchMobyVolumeData(timestamp, arb_mobyVolumeEndpoint);
}

export async function bera_fetchMobyVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  return await _fetchMobyVolumeData(timestamp, bera_mobyVolumeEndpoint);
}

async function getMobyVolumeData(endpoint: string): Promise<IMobyVolumeResponse> {
  const results = await fetchURL(endpoint)

  return results.result;
}

export default moby_adapter;
