import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const permuteEndpoint = "https://api.permute.finance/bridge"

const chainConfig: Record<string, any> = {
  [CHAIN.BITCOIN]: { start: '2025-05-28', key: 'BTC'},
  [CHAIN.ETHEREUM]: { start: '2025-05-28', key: 'ETH'},
  [CHAIN.AVAX]: { start: '2025-05-28', key: 'AVXC'},
  [CHAIN.ARBITRUM]: { start: '2025-05-28', key: 'ARBITRUM'},
  [CHAIN.BSC]: { start: '2025-05-28', key: 'BSC'},
  [CHAIN.TRON]: { start: '2025-05-28', key: 'TRON'},
  [CHAIN.LITECOIN]: { start: '2025-05-28', key: 'LTC'},
  [CHAIN.BITCOIN_CASH]: { start: '2025-05-28', key: 'BCH'},
  [CHAIN.DOGE]: { start: '2025-05-28', key: 'DOGE'},
  [CHAIN.SOLANA]: { start: '2025-05-28', key: 'SOL'},
  [CHAIN.BERACHAIN]: { start: '2025-05-28', key: 'BERA'},
}

const fetch = async (options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
  const feesForChainAndDay = await httpGet(permuteEndpoint.concat(`/dashboard/fees/chain/day?chain=${chainConfig[options.chain].key}&timestamp=${startOfDay}`))

  const dailyFees = options.createBalances()
  
  dailyFees.addUSDValue(feesForChainAndDay.total_fees || 0, 'Bridge Fees')
  dailyFees.addUSDValue(feesForChainAndDay.daily_token_taxes || 0, 'Token Tax Fees')
  dailyFees.addUSDValue(feesForChainAndDay.electron_fees || 0, 'Electron Fees')

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "The total fee incurred during bridging, including all transaction fees on both the source and destination chains.",
  Revenue: "The protocol takes 0% cut of assets during bridging",
  SupplySideRevenue: "The total fee incurred during bridging, including all transaction fees on both the source and destination chains.",
}

const breakdownMethodology = {
  Fees: {
    'Bridge Fees': 'Total bridge fees incurred during bridging.',
    'Token Tax Fees': 'Token taxes incurred during bridging.',
    'Electron Fees': 'Electron fees incurred during bridging.',
  },
  UserFees: {
    'Bridge Fees': 'Total bridge fees incurred during bridging.',
    'Token Tax Fees': 'Token taxes incurred during bridging.',
    'Electron Fees': 'Electron fees incurred during bridging.',
  },
  SupplySideRevenue: {
    'Bridge Fees': 'Total bridge fees incurred during bridging.',
    'Token Tax Fees': 'Token taxes incurred during bridging.',
    'Electron Fees': 'Electron fees incurred during bridging.',
  },
}

const adapters: SimpleAdapter = {
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true // bridging fees can be negative due to price fluctuations
};

export default adapters
