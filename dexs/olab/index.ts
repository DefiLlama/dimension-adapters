import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const OLAB_METRICS_URL = 'https://api.olab.xyz/api/v2/statistics';

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const data = await fetchURL(OLAB_METRICS_URL);
  const {result: {tradingVolume}} = data;
  return {
    totalVolume: `${tradingVolume}`,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2024-12-19",
    },
  },
};

export default adapter;
