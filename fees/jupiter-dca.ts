import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "./jupiter";

const fethcFeesSolana = async (options: FetchOptions) => {
  const fees = await getSolanaReceived({ options, targets: [
    'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2'
  ]})
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  dailyFees.add(fees, JUPITER_METRICS.JupDCAFees);
  dailyRevenue.add(fees, JUPITER_METRICS.JupDCAFees);
  
  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  const revenueHolders = dailyRevenue.clone(buybackRatio);
  const revenueProtocol = dailyRevenue.clone(1 - buybackRatio);
  dailyProtocolRevenue.add(revenueProtocol, JUPITER_METRICS.JupDCAFees);
  dailyHoldersRevenue.add(revenueHolders, JUPITER_METRICS.TokenBuyBack);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}


const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2024-01-01',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All DCA trading fees.',
    Revenue: 'All fees collected by protocol and JUP token holders.',
    ProtocolRevenue: 'Share of 50% fees collected by protocol, it was 100% before 2025-02-17.',
    HoldersRevenue: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupDCAFees]: 'All DCA trading fees.',
    },
    Revenue: {
      [JUPITER_METRICS.JupDCAFees]: 'All fees collected by protocol and JUP token holders',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupApeFees]: 'Share of 50% fees collected by protocol, it was 100% before 2025-02-17.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
    },
  }
}

export default adapter
