import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// https://gemwallet.com/
const HL_BUILDER_ADDRESS = '0x0d9dab1a248f63b0a48965ba8435e4de7497a3dc';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: 'Trading fees paid by users for perps in Gem Wallet.',
  Revenue: 'Fees collected by Gem Wallet from Hyperliquid Perps as Builder Revenue.',
  ProtocolRevenue: 'Fees collected by Gem Wallet from Hyperliquid Perps as Builder Revenue.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-08-01',
  methodology,
  doublecounted: true,
};

export default adapter;
