import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../helpers/hyperliquid-v2";
import { KINETIQ_MARKETS_BUILDER_ADDRESSES } from "./kinetiq-interface";

// Spot trades placed through the Kinetiq Markets builder codes; perps are in dexs/kinetiq-interface.ts.
const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees: builderFees } = await fetchBuilderCodeDataV2({ options, builderAddresses: KINETIQ_MARKETS_BUILDER_ADDRESSES, market: 'spot' });

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
    Volume: "Hyperliquid spot volume routed through the Kinetiq Markets interface's builder codes.",
    Fees: "Builder-code fees paid by users trading Hyperliquid spot through the Kinetiq Markets interface.",
    Revenue: "Builder-code fees on Hyperliquid spot trades, retained entirely by Kinetiq.",
    ProtocolRevenue: "Builder-code fees on Hyperliquid spot trades, all sent to Kinetiq.",
  },
  breakdownMethodology: {
    Fees: {
      'Hyperliquid Builder Code Fees': 'All spot trading fees using Hyperliquid builder code.',
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
