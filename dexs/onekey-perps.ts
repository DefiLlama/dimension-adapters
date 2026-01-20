import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// https://onekey.so/
const HL_BUILDER_ADDRESS = '0x9b12e858da780a96876e3018780cf0d83359b0bb';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: 'Trading fees paid by users for perps in OneKey Wallet.',
  Revenue: 'Fees collected by OneKey from Hyperliquid Perps as Builder Revenue.',
  ProtocolRevenue: 'Fees collected by OneKey from Hyperliquid Perps as Builder Revenue.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-08-20',
  methodology,
};

export default adapter;
