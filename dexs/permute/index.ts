import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL";
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
}

const CHAINS = ['BTC', 'ETH', 'AVAXC', 'ARBITRUM', 'BSC', 'TRON', 'LTC', 'BCH', 'DOGE', 'SOL']

const getFetchForChain = (chainShortName: string) => {
  return async (_a: any, _b: any, options: FetchOptions) => {
    const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
    const volumeForDay = await fetchURL(permuteEndpoint.concat(`/dashboard/vol/chain/day?chain=${chainShortName}&timestamp=${startOfDay}`))

    const dailyVolume = volumeForDay.day_vol

    return {
      dailyVolume: dailyVolume,
    };
  };
};


const adapter: SimpleAdapter = {
  methodology: {
    Volume: "This represents the total value of assets bridged over the period.",
  },
  adapter: CHAINS.reduce((acc, chainKey) => {
    acc[chainMapping[chainKey]] = {
      fetch: getFetchForChain(chainKey) as any,
      start: '2025-05-28',
    };
    return acc;
  }, {}),
};

export default adapter;
