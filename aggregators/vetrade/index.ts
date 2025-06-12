import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = 'https://vetrade.vet/api/index/analytics/volumes/';
const startTimestamp = 1743465600; // 2025-04-01

interface IAPIResponse {
  date: number;
  volume_vet: number;
  volume_usd: number;
  trade_count: number;
  last_updated: string;
}
const fetch = async (_timestamp: number): Promise<FetchResult> => {
  const timestamp = getUniqStartOfTodayTimestamp(new Date(_timestamp * 1000));
  const dateString = new Date(timestamp * 1000).toISOString().split('T')[0];
  const { volume_usd: dailyVolume }: IAPIResponse = (await fetchURL(`${URL}${dateString}`));
  return {
    dailyVolume,
    timestamp
  };


}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.VECHAIN]: {
      fetch,
      start: startTimestamp,
    },
  },
};

export default adapter;
