import {SimpleAdapter} from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import {getDimensions, IDimensions} from "./dimensions";
import {getStartTimestamp} from "./startTimestamp";

const fetch = async (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const dayTimestamp = getUniqStartOfTodayTimestamp(date);
  const dateStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  const dimensions: IDimensions = await getDimensions(dateStr);

  return {
    // totalVolume: `${dimensions.totalVolume}`,
    dailyVolume: dimensions.dailyVolume ? `${dimensions.dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    persistence: {
      fetch,
      runAtCurrTime: false,
      start: 1679875200,
    },
  },
};

export default adapter;
