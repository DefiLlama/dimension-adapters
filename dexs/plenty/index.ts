import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const plentyData = (await fetchURL("https://api.analytics.plenty.network/analytics/plenty")).data;
  const dailyVolumeItem = plentyData.volume.history.find((volItem : any) => Object.keys(volItem)[0] === dayTimestamp.toString());

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolumeItem[dayTimestamp.toString()],
  }
}

const getStartTime = async () => {
  const plentyData = (await fetchURL("https://api.analytics.plenty.network/analytics/plenty")).data;
  return parseInt(Object.keys(plentyData.volume.history[0])[0]);
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetch,
      start: getStartTime,
    },
  },
};

export default adapter
