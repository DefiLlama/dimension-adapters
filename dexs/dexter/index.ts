import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {getDimensions, IDimensions} from "./dimensions";

const fetch = async (options: FetchOptions) => {
  const dimensions: IDimensions = await getDimensions(options.dateString);

  return {
    dailyVolume: dimensions.dailyVolume ? `${dimensions.dailyVolume}` : undefined,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.PERSISTENCE],
  start: '2023-03-27',
  // dexter.zone + app.dexter.zone + api2.core-1.dexter.zone all DNS-dead; last nonzero volume 2025-11-26
  deadFrom: '2025-11-27',
};

export default adapter;
