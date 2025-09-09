import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const volumeEndpoint = "https://api.urdex.finance/kol/getVolumeData"

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const volumeData = (await fetchURL(`${volumeEndpoint}?date=${dayTimestamp}`)).data;
  return {
    dailyVolume: volumeData.daily.TotalTradingVolume ? `${volumeData.daily.TotalTradingVolume}` : '0',
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  return 1686009600
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: getStartTimestamp
    },
  },
};

export default adapter;
