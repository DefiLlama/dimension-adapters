import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

const fetchVolume = async (options: FetchOptions) => {
  let timestamp = options.startOfDay * 1_000;

  const res = await httpPost("http://35.153.229.202/api/volume", { timestamp });
  const record = res.record || {};

  return {
    dailyVolume: record.total_volume_usd ? record.total_volume_usd.toFixed(2) : 0,
    totalVolume: res.total_volume_usd ? res.total_volume_usd.toFixed(2) : 0,
    dailyFees: 0,
    totalFees: 0,
    timestamp: timestamp,
  };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: () => 1714276800
    },
  },
};

export default adapter;