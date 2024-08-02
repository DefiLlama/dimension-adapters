import { CHAIN } from "../../../helpers/chains";
import { httpGet } from "../../../utils/fetchURL";
import { FetchOptions } from "../../../adapters/types";

const fetchVolume = async (options: FetchOptions) => {
  const url = `https://api-sui.cetus.zone/v2/sui/aggregator_vol?startTimestamp=${options.startOfDay}&endTimestamp=${options.startOfDay}`;
  const res = await httpGet(url);
  return {
    dailyVolume: res.data.list[0].totalUSD,
  }
};

const adapter_agge: any = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: 1721260800,
    },
  },
};

export {
  adapter_agge,
}
