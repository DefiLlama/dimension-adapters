import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../helpers/hyperliquid-v2";

// Kinetiq Markets routes orders through two production builder codes, one per client. Both are
// Kinetiq-operated and their fees accrue to Kinetiq; tracking only the web one understates revenue.
// This is the perps listing, spot trades through the same codes are in dexs/kinetiq-interface-spot.ts.
export const KINETIQ_MARKETS_BUILDER_ADDRESSES = [
  '0x42f3226007290b02c5a0b15bccbb1ba6df04f992', // markets.xyz web
  '0x2af94a24e1f744a8e251b4996283ffb4657e915d', // markets.xyz mobile
];

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees: builderFees } = await fetchBuilderCodeDataV2({ options, builderAddresses: KINETIQ_MARKETS_BUILDER_ADDRESSES, market: 'perps' });

  const dailyFees = options.createBalances();
  dailyFees.add(builderFees, 'Hyperliquid Builder Code Fees');
  const dailyRevenue = dailyFees.clone(1, 'Builder Code Fees To Kinetiq');

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the indexer serves daily summaries
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-12-16',
  doublecounted: true,
  methodology: {
    Volume: "Hyperliquid perps volume routed through the Kinetiq Markets interface's builder codes, including trades on HIP-3 markets.",
    Fees: "Builder-code fees paid by users trading Hyperliquid perps through the Kinetiq Markets interface.",
    Revenue: "Builder-code fees on Hyperliquid perps trades, retained entirely by Kinetiq.",
    ProtocolRevenue: "Builder-code fees on Hyperliquid perps trades, all sent to Kinetiq.",
  },
  breakdownMethodology: {
    Fees: {
      'Hyperliquid Builder Code Fees': 'All perps trading fees using Hyperliquid builder code.',
    },
    Revenue: {
      'Builder Code Fees To Kinetiq': 'Builder-code fees retained by Kinetiq.',
    },
    ProtocolRevenue: {
      'Builder Code Fees To Kinetiq': 'Builder-code fees retained by Kinetiq.',
    },
  }
};

export default adapter;
