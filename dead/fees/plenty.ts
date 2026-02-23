import fetchURL from "../utils/fetchURL"
import { CHAIN } from "../helpers/chains";
import { Adapter } from "../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const plentyData = (await fetchURL("https://analytics.plenty.network/api/v1/overall"));
  const fees = plentyData.fees_24hours_dollar;

  return {
    timestamp: dayTimestamp,
    dailyFees: fees,
  };
};

const adapter: Adapter = {
  deadFrom: '2025-01-01',
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetch,
      start: '2023-01-01',
      runAtCurrTime: true,
    },
  },
};

export default adapter
