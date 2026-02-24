
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetchLiquidityHub = async (_a: any, _: any, options: FetchOptions) => {
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

export default {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchLiquidityHub,
      start: '2023-09-18',
    },
  },
}