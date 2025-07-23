import {SimpleAdapter} from "../../adapters/types";
import {getDimensions, IDimensions} from "./dimensions";

const fetch = async (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const dateStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  const dimensions: IDimensions = await getDimensions(dateStr);

  return {
    dailyVolume: dimensions.dailyVolume ? `${dimensions.dailyVolume}` : undefined,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    persistence: {
      fetch,
      start: '2023-03-27',
    },
  },
};

export default adapter;
