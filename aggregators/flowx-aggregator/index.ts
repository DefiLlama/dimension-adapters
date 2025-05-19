import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

const fetchVolume = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const url = `https://flowx-finance-mono.vercel.app/api/defillama/aggregator-vol?startTimestamp=${fromTimestamp}&endTimestamp=${toTimestamp}`;
  const res = await httpGet(url);
  const record = res[0];
  return {
    dailyVolume: record.totalUSD,
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
