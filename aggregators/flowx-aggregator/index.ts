import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { version } from "os";

const fetchVolume = async (options: FetchOptions) => {
  const url = `https://flowx-finance-mono.vercel.app/api/defillama/aggregator-vol?startTimestamp=${options.startOfDay}&endTimestamp=${options.startOfDay}`;
  const res = await httpGet(url);
  const record = res[0];
  return {
    dailyVolume: record.totalUSD,
  }





};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: 1717200000,
    },
  },
};

export default adapter;
