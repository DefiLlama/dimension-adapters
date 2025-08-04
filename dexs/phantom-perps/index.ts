import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const HL_BUILDER_ADDRESS = '0xb84168cf3be63c6b8dad05ff5d755e97432ff80b';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-07-01',
  isExpensiveAdapter: true
};

export default adapter;
