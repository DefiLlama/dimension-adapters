import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint =
  "https://api.prod.merkle.trade/external/defillama/v1/trading-volume";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const res = (await fetchURL(`${endpoint}?ts=${timestamp}`));

  return {
    dailyVolume: res.dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: '2023-10-24',
    },
  },
};

export default adapter;
