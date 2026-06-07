import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getVolume } from "./helpers";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = await getVolume(options.toTimestamp);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-01-23',
  deadFrom: "2024-11-30",
};

export default adapter;
