import { IExchangeTotalVolume } from "./../flowx-finance/index";
import { Adapter, BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (timestamp: number) => {
  const url = `https://www.api.pearprotocol.io/v1/metric?timestamp=${timestamp}`;
  const response = await httpGet(url);

  const totalVolume = response.payload.totalVolume;
  const dailyVolume = response.payload.dailyVolume;

  return {
    totalVolume,
    dailyVolume,
    timestamp,
  };
};

const adapter: BreakdownAdapter = {
  breakdown: {
    derivatives: {
      [CHAIN.ARBITRUM]: {
        fetch: fetch,
        start: 1715199684,
      },
    },
  },
};

export default adapter;
