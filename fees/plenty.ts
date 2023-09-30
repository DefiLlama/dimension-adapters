import fetchURL from "../utils/fetchURL"
import { CHAIN } from "../helpers/chains";
import { Adapter } from "../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const plentyData = (await fetchURL("https://analytics.plenty.network/api/v1/overall")).data;
  const dailyFeesItem = plentyData.fees_24hours_dollar;

  return {
    timestamp: dayTimestamp,
    dailyFees: dailyFeesItem ?? undefined,
  };
};

const getStartTime = async () => {
  const plentyData = (await fetchURL("https://api.analytics.plenty.network/analytics/plenty")).data;
  return parseInt(Object.keys(plentyData.fees.history[0])[0]);
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetch,
      start: async () => 1672531200,
      runAtCurrTime: true,
    },
  },
};

export default adapter
