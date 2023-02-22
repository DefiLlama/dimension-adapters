import fetchURL from "../utils/fetchURL"
import { CHAIN } from "../helpers/chains";
import { Adapter } from "../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const plentyData = (await fetchURL("https://api.analytics.plenty.network/analytics/plenty")).data;
  const dailyFeesItem = plentyData.fees.history.find((feesItem : any) => Object.keys(feesItem)[0] === dayTimestamp.toString());

  return {
    timestamp: dayTimestamp,
    dailyFees: dailyFeesItem[dayTimestamp.toString()] ?? undefined,
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
      start: getStartTime,
    },
  },
};

export default adapter