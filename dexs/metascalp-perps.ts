import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// https://metascalp.io
const HL_BUILDER_ADDRESS = '0xa9ab442f9dfe752dc74b666c41e7a0498baf8687';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: 'Trading fees paid by users for perps in Metascalp Trading Terminal.',
  Revenue: 'Fees collected by Metascalp from Hyperliquid Perps as Builder Revenue.',
  ProtocolRevenue: 'Fees collected by Metascalp from Hyperliquid Perps as Builder Revenue.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-09-11',
  methodology,
};

export default adapter;
