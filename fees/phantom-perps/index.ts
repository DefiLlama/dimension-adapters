import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const HL_BUILDER_ADDRESS = '0xb84168cf3be63c6b8dad05ff5d755e97432ff80b';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: 'trading fees paid by users for perps in Phantom wallet.',
  Revenue: 'Builder Code Fees collected by Phantom from Hyperliquid Perps as Frontend Fees.',
  ProtocolRevenue: 'Builder Code Fees collected by Phantom from Hyperliquid Perps.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-07-08',
  methodology,
  isExpensiveAdapter: true
};

export default adapter;
