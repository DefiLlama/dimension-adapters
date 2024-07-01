import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const fetchVolume = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const res = await httpGet(
    `https://flowx-finance-mono.vercel.app/api/defillama/aggregator-vol?startTimestamp=${dayTimestamp}&endTimestamp=${dayTimestamp}`
  );

  const record = res[0];

  return {
    dailyVolume: record.totalUSD,
    timestamp: record.timestamp,
  };
};

const adapter: any = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: 1717200000,
    },
  },
};

export default adapter;
