import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";

const URL = (date: string) => `https://api.pact.fi/api/pools/overall/historical_stats?interval=DAY&start=${date}`;

interface IAPIResponse {
  for_datetime: string;
  volume: string;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)
  const url = URL(new Date(yesterdaysTimestamp * 1000).toISOString());
  const response: IAPIResponse[] = (await fetchURL(url));
  const dailyVolume = response
    .find(dayItem => (new Date(dayItem.for_datetime.split('T')[0]).getTime() / 1000) === dayTimestamp)?.volume;

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch,
      start: '2022-11-04',
    },
  },
};

export default adapter;
