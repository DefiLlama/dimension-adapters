import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const permuteEndpoint = "https://api.permute.finance/bridge"

const chainMapping = {
  BTC: CHAIN.BITCOIN,
  ETH: CHAIN.ETHEREUM,
  AVAXC: CHAIN.AVAX,
  ARBITRUM: CHAIN.ARBITRUM,
  BSC: CHAIN.BSC,
  TRON: CHAIN.TRON,
  LTC: CHAIN.LITECOIN,
  BCH: CHAIN.BITCOIN_CASH,
  DOGE: CHAIN.DOGE,
  SOL: CHAIN.SOLANA,
  BERA: CHAIN.BERACHAIN,
}

const CHAINS = Object.keys(chainMapping);

const getFetchForChain = (chainShortName: string) => {
  return async (_a: any, _b: any, options: FetchOptions) => {
    const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
    const feesForChainAndDay = await httpGet(permuteEndpoint.concat(`/dashboard/fees/chain/day?chain=${chainShortName}&timestamp=${startOfDay}`))

    let dailyFees = feesForChainAndDay.total_fees
    let dailyRevenue = feesForChainAndDay.electron_fees
    let dailyTokenTaxes = feesForChainAndDay.daily_token_taxes

    return {
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue: dailyRevenue,
      dailyTokenTaxes: dailyTokenTaxes,
      timestamp: startOfDay
    };
  };
};

const adapters: SimpleAdapter = {
  adapter: CHAINS.reduce((acc, chainKey) => {
    acc[chainMapping[chainKey]] = {
      fetch: getFetchForChain(chainKey) as any,
      start: '2025-05-28',
    };
    return acc;
  }, {}),
  methodology: {
    Fees: "The total fee incurred during bridging, including all transaction fees on both the source and destination chains.",
    Revenue: "The protocol takes 0% cut of assets during bridging",
    HoldersRevenue: "Token holders fees share",
  }
};

export default adapters
