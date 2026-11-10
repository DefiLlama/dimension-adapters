import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

const fetchVolume = async (options: FetchOptions) => {
  // API buckets by hour with both bounds inclusive; endTimestamp - 1 keeps the next window's first bucket out
  const url = `https://api-sui.cetus.zone/v3/sui/vol/aggregator/time_range?date_type=hour&start_time=${options.startTimestamp}&end_time=${options.endTimestamp - 1}`;
  const res = await httpGet(url);
  return {
    dailyVolume: res.data.vol_in_usd,
  }
};

const adapter_agge: any = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: '2024-07-18',
    },
  },
};

export default adapter_agge;