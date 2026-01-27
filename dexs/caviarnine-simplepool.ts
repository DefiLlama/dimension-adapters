import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const URL = "https://api-core.caviarnine.com/v1.0/stats/product/simplepools";

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response = await fetchURL(URL);
  const dailyVolume = response.summary.volume.interval_1d.usd;
  const dailyFees = response.summary.protocol_fees.interval_1d.usd;
  return {
    dailyVolume,
    dailyFees,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch,
      runAtCurrTime: true
    },
  },
};

export default adapter;
