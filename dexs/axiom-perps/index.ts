import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const HL_BUILDER_ADDRESS = '0x1cc34f6af34653c515b47a83e1de70ba9b0cda1f';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-01-21',
  isExpensiveAdapter: true
};

export default adapter;
