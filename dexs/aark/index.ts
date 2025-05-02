import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint = "https://public-api.aark.digital/stats/volume/futures";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const res = (await fetchURL(`${endpoint}/${timestamp}`))

  return {
    totalVolume: res.data.totalVolume,
    dailyVolume: res.data.dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2023-08-12',
    },
  },
};

export default adapter;
