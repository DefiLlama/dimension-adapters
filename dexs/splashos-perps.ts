import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// https://splashwallet.xyz/
const HL_BUILDER_ADDRESS = '0xe9935bb291ab3603b4d7862e6f19315f759aa3a4';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: 'Trading fees paid by users for perps in SplashOS Mobile App.',
  Revenue: 'Fees collected by SplashOS from Hyperliquid Perps as Builder Revenue.',
  ProtocolRevenue: 'Fees collected by SplashOS from Hyperliquid Perps as Builder Revenue.',
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
