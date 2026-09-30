import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";

// Kinetiq's HIP-3 markets are tracked in dexs/kinetiq-markets.ts. This listing is the builder-code
// side: orders placed through the Kinetiq Markets interface, on any Hyperliquid perp market.
const KINETIQ_MARKETS_LEGACY_END_DATE = "2026-06-20";
// Kinetiq Markets routes orders through two production builder codes, one per client. Both are
// Kinetiq-operated and their fees accrue to Kinetiq; tracking only the web one understates revenue.
const KINETIQ_MARKETS_BUILDER_ADDRESSES = [
  '0x42f3226007290b02c5a0b15bccbb1ba6df04f992', // markets.xyz web
  '0x2af94a24e1f744a8e251b4996283ffb4657e915d', // markets.xyz mobile
];

// Hyperliquid only publishes a builder_fills CSV for days on which the builder had fills, and the
// helper turns the resulting 403 into an error. A day with no fills is a genuine zero, not a
// failure, so it is logged and skipped rather than taking down the whole day's fetch (which would
// also drop the other builder).
const NO_DATA_ERROR = 'Builder fee data is not available';

const builderCodeRevenue = async (options: FetchOptions, builder_address: string, market?: 'hip3', hip3DeployerId?: string) => {
  try {
    return await fetchBuilderCodeRevenue({ options, builder_address, market, hip3DeployerId });
  } catch (error: any) {
    if (!String(error?.message).includes(NO_DATA_ERROR)) throw error;
    console.error(`kinetiq-interface: no builder fills for ${builder_address} on ${options.dateString}`);
    return { dailyVolume: options.createBalances(), dailyFees: options.createBalances() };
  }
};

const fetch = async (options: FetchOptions) => {
  const deployerId = options.dateString > KINETIQ_MARKETS_LEGACY_END_DATE ? 'mkts' : 'km';
  const dailyVolume = options.createBalances();
  const builderFees = options.createBalances();

  for (const builder_address of KINETIQ_MARKETS_BUILDER_ADDRESSES) {
    const { dailyVolume: builderVolume, dailyFees } = await builderCodeRevenue(options, builder_address);

    dailyVolume.add(builderVolume);
    builderFees.add(dailyFees);

    // Builder-routed trades on Kinetiq's own HIP-3 markets are already counted as volume by
    // kinetiq-markets, so they are left out here to count each trade once across the two listings.
    // No builder activity means the builder/HIP-3 intersection is necessarily zero.
    if (await builderVolume.getUSDValue()) {
      const { dailyVolume: builderHip3Volume } = await builderCodeRevenue(options, builder_address, 'hip3', deployerId);
      dailyVolume.subtract(builderHip3Volume);
    }
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Builder-code fees are retained entirely by Kinetiq.
  dailyFees.add(builderFees, 'Hyperliquid Builder Code Fees');
  dailyRevenue.add(builderFees, 'Builder Code Fees To Kinetiq');

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-12-16',
  doublecounted: true,
  methodology: {
    Volume: "Trading volume routed through the Kinetiq Markets interface's builder codes on Hyperliquid perps. Trades on Kinetiq's own HIP-3 markets are excluded here because Kinetiq Markets already counts them.",
    Fees: "Builder-code fees paid by users trading on Hyperliquid through the Kinetiq Markets interface.",
    Revenue: "Builder-code fees, retained entirely by Kinetiq.",
    ProtocolRevenue: "Same as Revenue - retained by Kinetiq.",
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
