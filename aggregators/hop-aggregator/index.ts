import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";

const fetchVolume = async (timestamp: number) => {
  timestamp = timestamp * 1_000;
  const res = await httpPost("https://d3axhvc6i89jmo.cloudfront.net/api/volume", { timestamp });
  const record = res.record || {};

  return {
    dailyVolume: record.total_volume_usd ? record.total_volume_usd.toFixed(2) : 0,
    totalVolume: res.total_volume_usd ? res.total_volume_usd.toFixed(2) : 0,
    dailyFees: 0,
    totalFees: 0,
    timestamp: timestamp/1_000,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: 1713672000
    },
  },
};

export default adapter;