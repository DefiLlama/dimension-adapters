import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const permuteEndpoint = "https://api.permute.finance/bridge"

const chainConfig = {
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
  const feesForChainAndDay = await httpGet(permuteEndpoint.concat(`/dashboard/fees/chain/day?chain=${chainConfig[options.chain].key}&timestamp=${startOfDay}`))

  let dailyFees = feesForChainAndDay.total_fees
  let dailyRevenue = feesForChainAndDay.electron_fees
  let dailyTokenTaxes = feesForChainAndDay.daily_token_taxes

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyTokenTaxes: dailyTokenTaxes
  };
};

const methodology = {
  Fees: "The total fee incurred during bridging, including all transaction fees on both the source and destination chains.",
  Revenue: "The protocol takes 0% cut of assets during bridging",
  HoldersRevenue: "Token holders fees share",
}

const adapters: SimpleAdapter = {
  fetch,
  adapter: chainConfig,
  methodology,
  allowNegativeValue: true // bridging fees can be negative due to price fluctuations
};

export default adapters
