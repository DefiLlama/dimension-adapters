import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {getDimensions, IDimensions} from "./dimensions";

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.toTimestamp * 1000);
  const dateStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  const dimensions: IDimensions = await getDimensions(dateStr);

  return {
    dailyVolume: dimensions.dailyVolume ? `${dimensions.dailyVolume}` : undefined,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.PERSISTENCE],
  start: '2023-03-27',
};

export default adapter;
