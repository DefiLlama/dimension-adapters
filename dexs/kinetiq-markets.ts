import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue, fetchHIP3DeployerData } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume: builderVolume, dailyFees: builderFees } = await fetchBuilderCodeRevenue({
    options,
    builder_address: '0x42f3226007290b02c5a0b15bccbb1ba6df04f992',
  });
  const { dailyPerpVolume: hip3Volume, dailyPerpFee: hip3Fees, currentPerpOpenInterest } = await fetchHIP3DeployerData({
    options,
    hip3DeployerId: 'km',
  });
  
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  
  dailyVolume.add(builderVolume);
  dailyVolume.add(hip3Volume);
  dailyFees.add(builderFees, 'Hyperliquid Builder Code Fees');
  dailyFees.add(hip3Fees, 'Hyperliquid HIP-3 Markets Fees');
  
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    openInterestAtEnd: currentPerpOpenInterest,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-12-16',
  doublecounted: true,
  runAtCurrTime: true,
  methodology: {
    Fees: "Trading fees paid by users for perps in using Hyperliquid HIP-3 markets and builder code.",
    Revenue: "Fees collected by Kinetiq Revenue from Hyperliquid and HIP-3 markets.",
    ProtocolRevenue: "Fees collected by Kinetiq as Builder Revenue from Hyperliquid and HIP-3 markets.",
  },
  breakdownMethodology: {
    Fees: {
      'Hyperliquid Builder Code Fees': 'All perps trading fees using Hyperliquid builder code.',
      'Hyperliquid HIP-3 Markets Fees': 'All perps trading fees from Hyperliquid HIP-3 markets.',
    },
    Revenue: {
      'Hyperliquid Builder Code Fees': 'All perps trading fees using Hyperliquid builder code.',
      'Hyperliquid HIP-3 Markets Fees': 'All perps trading fees from Hyperliquid HIP-3 markets.',
    },
    ProtocolRevenue: {
      'Hyperliquid Builder Code Fees': 'All perps trading fees using Hyperliquid builder code.',
      'Hyperliquid HIP-3 Markets Fees': 'All perps trading fees from Hyperliquid HIP-3 markets.',
    },
  }
};

export default adapter;
