import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const { volume, } = (await httpGet(`https://dapi.api.sui-prod.bluefin.io/marketData/volume?startTime=${startTimestamp * 1000}&&endTime=${endTimestamp * 1000}`))

  return {
    dailyVolume: volume,
  };
};


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    derivatives: {
      [CHAIN.SUI]: {
        fetch,
        start: 1695600000,
      },
    },
  },
};

export default adapter;
