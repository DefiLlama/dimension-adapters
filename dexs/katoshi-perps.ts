import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// https://katoshi.ai/
const HL_BUILDER_ADDRESS = '0x274e3cdb7bdc4805f41a07e3348243ba3e7e5b72';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: 'Trading fees paid by users for perps in Katoshi Trading Terminal.',
  Revenue: 'Fees collected by Katoshi from Hyperliquid Perps as Builder Revenue.',
  ProtocolRevenue: 'Fees collected by Katoshi from Hyperliquid Perps as Builder Revenue.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-08-01',
  methodology,
};

export default adapter;
