import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

const fetchVolume = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const url = `https://flowx-finance-mono.vercel.app/api/defillama/aggregator-with-date?startTimestamp=${
    fromTimestamp * 1000
  }&endTimestamp=${toTimestamp * 1000}`;

  const res = await httpGet(url);
  return {
    dailyVolume: res.totalUSD,
  };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: "2024-06-01",
    },
  },
};

export default adapter;
