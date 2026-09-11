import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue, fetchHIP3DeployerData } from "../helpers/hyperliquid";

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
// also drop the other builder and the HIP-3 leg).
const NO_DATA_ERROR = 'Builder fee data is not available';

const builderCodeRevenue = async (options: FetchOptions, builder_address: string, market?: 'hip3', hip3DeployerId?: string) => {
  try {
    return await fetchBuilderCodeRevenue({ options, builder_address, market, hip3DeployerId });
  } catch (error: any) {
    if (!String(error?.message).includes(NO_DATA_ERROR)) throw error;
    console.error(`kinetiq-markets: no builder fills for ${builder_address} on ${options.dateString}`);
    return { dailyVolume: options.createBalances(), dailyFees: options.createBalances() };
  }
};

const fetch = async (options: FetchOptions) => {
  const deployerId = options.dateString > KINETIQ_MARKETS_LEGACY_END_DATE ? 'mkts' : 'km';
  const builderVolume = options.createBalances();
  const builderFees = options.createBalances();
  const builderHip3OverlapVolume = options.createBalances();

  for (const builder_address of KINETIQ_MARKETS_BUILDER_ADDRESSES) {
    const { dailyVolume, dailyFees } = await builderCodeRevenue(options, builder_address);

    builderVolume.add(dailyVolume);
    builderFees.add(dailyFees);

    // No builder activity means the builder/HIP-3 intersection is necessarily zero.
    if (await dailyVolume.getUSDValue()) {
      const { dailyVolume: builderHip3Volume } = await builderCodeRevenue(options, builder_address, 'hip3', deployerId);

      builderHip3OverlapVolume.add(builderHip3Volume);
    }
  }

  const { dailyPerpVolume: hip3Volume, dailyPerpFee: hip3Fees, dailyDeployerFee: hip3DeployerFee } = await fetchHIP3DeployerData({
    options,
    hip3DeployerId: deployerId,
  });

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.add(builderVolume);
  dailyVolume.subtract(builderHip3OverlapVolume);
  dailyVolume.add(hip3Volume);

  // Builder-code fees are retained entirely by Kinetiq.
  dailyFees.add(builderFees, 'Hyperliquid Builder Code Fees');
  dailyRevenue.add(builderFees, 'Builder Code Fees To Kinetiq');

  // On HIP-3 markets Kinetiq only keeps its deployer-fee cut; the rest is paid through to Hyperliquid.
  dailyFees.add(hip3Fees, 'Hyperliquid HIP-3 Markets Fees');
  dailyRevenue.add(hip3DeployerFee, 'HIP-3 Deployer Fees To Kinetiq');
  const hip3ToHyperliquid = hip3Fees.clone();
  hip3ToHyperliquid.subtract(hip3DeployerFee);
  dailySupplySideRevenue.add(hip3ToHyperliquid, 'HIP-3 Fees To Hyperliquid');

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-12-16',
  doublecounted: true,
  methodology: {
    Volume: "Unique trading volume routed through Kinetiq Markets' builder code or executed on Kinetiq's HIP-3 markets. Builder-routed trades on Kinetiq's own HIP-3 markets are counted once.",
    Fees: "Trading fees paid by users on Hyperliquid via Kinetiq's builder code and its HIP-3 markets.",
    Revenue: "Builder-code fees (retained by Kinetiq) plus Kinetiq's deployer-fee cut of its HIP-3 market fees.",
    ProtocolRevenue: "Same as Revenue — retained by Kinetiq.",
    SupplySideRevenue: "The remainder of HIP-3 market fees, paid through to Hyperliquid.",
  },
  breakdownMethodology: {
    Fees: {
      'Hyperliquid Builder Code Fees': 'All perps trading fees using Hyperliquid builder code.',
      'Hyperliquid HIP-3 Markets Fees': 'All perps trading fees from Hyperliquid HIP-3 markets.',
    },
    Revenue: {
      'Builder Code Fees To Kinetiq': 'Builder-code fees retained by Kinetiq.',
      'HIP-3 Deployer Fees To Kinetiq': "Kinetiq's deployer-fee cut of HIP-3 market fees.",
    },
    ProtocolRevenue: {
      'Builder Code Fees To Kinetiq': 'Builder-code fees retained by Kinetiq.',
      'HIP-3 Deployer Fees To Kinetiq': "Kinetiq's deployer-fee cut of HIP-3 market fees.",
    },
    SupplySideRevenue: {
      'HIP-3 Fees To Hyperliquid': 'HIP-3 market fees paid through to Hyperliquid (not retained by Kinetiq).',
    },
  }
};

export default adapter;
