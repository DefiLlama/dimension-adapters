import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  let dailyResult = await fetchURL(
    "https://hub.orbs.network/analytics-daily/v1",
  );

  let dailyVolume = dailyResult.result.rows.find((row: any) => row.key === options.dateString)?.daily_total_calculated_value
  if (!dailyVolume)
    throw new Error(`No data found for date ${options.dateString}`);

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON],
  start: '2023-09-18',
}

export default adapter;