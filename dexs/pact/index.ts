import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";

// The old /api/pools/overall/historical_stats path 404s. app.pact.fi now calls
// this one, and it only serves a rolling ~31 day window: any older `start` comes
// back with the same last 31 days, so dates beyond that return no matching row.
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
