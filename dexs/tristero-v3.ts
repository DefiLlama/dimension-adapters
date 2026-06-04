import { FetchOptions, SimpleAdapter } from "../adapters/types";
import {
  TRISTERO_V3_VOLUME_CONFIGS,
  addTristeroV3ChainVolume,
  getTristeroV3Chains,
} from "../helpers/tristeroV3";

const fetch = async (options: FetchOptions) => {
  const config = TRISTERO_V3_VOLUME_CONFIGS[options.chain];
  if (!config) return { dailyVolume: options.createBalances() };

  const dailyVolume = await addTristeroV3ChainVolume(options, config);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    getTristeroV3Chains().map((chain) => [
      chain,
      {
        fetch,
        start: TRISTERO_V3_VOLUME_CONFIGS[chain].start,
      },
    ]),
  ),
  methodology: {
    Volume: "Tristero v3 volume is counted from decoded TAKER and CROSS router.send orders plus MARGIN opens and closes. Margin opens use collateral plus decoded loan quantity, and margin closes use escrow settlement transfers from successful escrow.close transactions.",
  },
};

export default adapter;
