import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
const { getUniqStartOfTodayTimestamp } = require("../../helpers/getUniSubgraphVolume");

const fetch = async (timestamp: number) => {

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const data = (await fetchURL('https://api.flamingo.finance/project-info/defillama-volume?timestamp=' + dayTimestamp));

  return {
    dailyVolume: data.volume,
    timestamp: data.timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    neo: {
      fetch,
      start: 1639130007,
    },
  },
};

export default adapter;