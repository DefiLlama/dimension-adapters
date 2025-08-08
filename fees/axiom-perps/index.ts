import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const HL_BUILDER_ADDRESS = '0x1cc34f6af34653c515b47a83e1de70ba9b0cda1f';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue: '0' };
};

const methodology = {
  Fees: 'Builder Code Fees paid by users for perps.',
  Revenue: 'Builder Code Fees collected by Axiom from Hyperliquid Perps.',
  ProtocolRevenue: 'Builder Code Fees collected by Axiom from Hyperliquid Perps.',
  HoldersRevenue: 'No fees distributed to token holders',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-06-08',
  isExpensiveAdapter: true
};

export default adapter;
