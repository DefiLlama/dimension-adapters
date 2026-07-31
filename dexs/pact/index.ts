import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";

const URL = (date: string) => `https://api.pact.fi/api/internal/pools_details/overall/historical_stats?interval=DAY&start=${date}`;

interface IAPIResponse {
  for_datetime: string;
  volume_usd: string;
};

const fetch = async (options: FetchOptions) => {
  const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(options.toTimestamp)
  const url = URL(new Date(yesterdaysTimestamp * 1000).toISOString());
  const response: IAPIResponse[] = (await fetchURL(url));
  const dailyVolume = response
    .find(dayItem => (new Date(dayItem.for_datetime.split('T')[0]).getTime() / 1000) === options.startOfDay)?.volume_usd;

  if (dailyVolume == undefined) {
    throw new Error(`No daily volume found for date ${options.dateString}`);
  }

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ALGORAND],
  start: '2022-11-04',
};

export default adapter;
