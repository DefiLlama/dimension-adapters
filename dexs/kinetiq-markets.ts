import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchHIP3DeployerData } from "../helpers/hyperliquid";

// Kinetiq's HIP-3 markets only. Builder-code volume and fees from the Kinetiq Markets interface
// are tracked separately in dexs/kinetiq-interface.ts.
const KINETIQ_MARKETS_LEGACY_END_DATE = "2026-06-20";

const fetch = async (options: FetchOptions) => {
  const deployerId = options.dateString > KINETIQ_MARKETS_LEGACY_END_DATE ? 'mkts' : 'km';

  const { dailyPerpVolume: hip3Volume, dailyPerpFee: hip3Fees, dailyDeployerFee: hip3DeployerFee } = await fetchHIP3DeployerData({
    options,
    hip3DeployerId: deployerId,
  });

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.add(hip3Volume);

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
    Volume: "Trading volume on Kinetiq's HIP-3 markets on Hyperliquid. Builder-code volume from the Kinetiq Markets interface is tracked in Kinetiq Interface.",
    Fees: "Trading fees paid by users on Kinetiq's HIP-3 markets on Hyperliquid.",
    Revenue: "Kinetiq's deployer-fee cut of its HIP-3 market fees.",
    ProtocolRevenue: "Same as Revenue - retained by Kinetiq.",
    SupplySideRevenue: "The remainder of HIP-3 market fees, paid through to Hyperliquid.",
  },
  breakdownMethodology: {
    Fees: {
      'Hyperliquid HIP-3 Markets Fees': 'All perps trading fees from Hyperliquid HIP-3 markets.',
    },
    Revenue: {
      'HIP-3 Deployer Fees To Kinetiq': "Kinetiq's deployer-fee cut of HIP-3 market fees.",
    },
    ProtocolRevenue: {
      'HIP-3 Deployer Fees To Kinetiq': "Kinetiq's deployer-fee cut of HIP-3 market fees.",
    },
    SupplySideRevenue: {
      'HIP-3 Fees To Hyperliquid': 'HIP-3 market fees paid through to Hyperliquid (not retained by Kinetiq).',
    },
  }
};

export default adapter;
