import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const KAVA_DAILY_VOLUME_API_URL = "https://market-api.openocean.finance/v1/defillama/kava/total_daily_volume";

interface KavaDailyVolumeApiResponse {
  chain: string,
  result: {
    volume: any;
  }
}

/**
 * Fetches the daily volume data for Kava.
 *
 * @param timestamp A UNIX timestamp.
 * @returns An object containing the daily volume and the start of the day's timestamp.
 */
async function fetchKavaDailyVolume(timestamp: number): Promise<{ dailyVolume: string; timestamp: number }> {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const { data = {} } = await fetchURL(KAVA_DAILY_VOLUME_API_URL);
  console.log('fetchKavaDailyVolume', data.chain, data.result.volume);
  const response: KavaDailyVolumeApiResponse = data;

  return {
    dailyVolume: `${response.result.volume || 0}`,
    timestamp: dayTimestamp,
  };
}

const kavaAdapterConfig = {
  fetch: fetchKavaDailyVolume,
  runAtCurrTime: true,
  customBackfill: undefined,
  start: async () => 0,
};

const kavaAdapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KAVA]: kavaAdapterConfig,
  },
};

export default kavaAdapter;
