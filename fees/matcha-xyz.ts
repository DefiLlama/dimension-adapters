import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getEVMTokenTransfers } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const balances = await getEVMTokenTransfers({
    options,
    blacklistTxFromAddresses: ['0x38F5E5b4DA37531a6e85161e337e0238bB27aa90'],
    toAddresses: ['0x38F5E5b4DA37531a6e85161e337e0238bB27aa90'],
  })
  const dailyFees = options.createBalances();
  dailyFees.addBalances(balances, METRIC.TRADING_FEES);

  return {
    dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees
  }
}

const methodology = {
  Fees: 'Matcha takes a 0.05% - 0.25% fee on certain pairs for matcha auto trades.',
  Revenue: 'all fees are collected by matcha',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Matcha takes a 0.05% - 0.25% fee on certain pairs for matcha auto trades.',
  },
}

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2023-06-07' },
  [CHAIN.BASE]: { start: '2024-03-06' },
  [CHAIN.POLYGON]: { start: '2023-02-23' },
  [CHAIN.ARBITRUM]: { start: '2024-02-12' },
  [CHAIN.BSC]: { start: '2023-09-12' },
  [CHAIN.AVAX]: { start: '2024-11-05' },
  [CHAIN.OPTIMISM]: { start: '2024-04-01' },
  [CHAIN.MONAD]: { start: '2025-11-24' },
  // [CHAIN.LINEA]: { start: '2023-06-01' },
  [CHAIN.PLASMA]: { start: '2025-10-01' },
  // [CHAIN.BERACHAIN]: { start: '2025-02-06' },
  [CHAIN.MANTLE]: { start: '2023-11-01' },
  [CHAIN.SCROLL]: { start: '2024-10-02' },
  // [CHAIN.ABSTRACT]: { start: '2023-06-01' },
  // [CHAIN.MODE]: { start: '2023-06-01' },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology
}

export default adapter;
