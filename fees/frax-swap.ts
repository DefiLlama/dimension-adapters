import { CHAIN } from "../helpers/chains";
import { FetchOptions, Adapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const poolsDataEndpoint = "https://api.frax.finance/v2/fraxswap/history?range=all"

const chains: Record<string, string> = {
  [CHAIN.ARBITRUM]: 'Arbitrum',
  [CHAIN.AURORA]: 'Aurora',
  [CHAIN.AVAX]: 'Avalanche',
  [CHAIN.BOBA]: 'Boba',
  [CHAIN.BSC]: 'BSC',
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.FANTOM]: 'Fantom',
  [CHAIN.FRAXTAL]: 'Fraxtal',
  [CHAIN.HARMONY]: 'Harmony',
  [CHAIN.MOONBEAM]: 'Moonbeam',
  [CHAIN.MOONRIVER]: 'Moonriver',
  [CHAIN.OPTIMISM]: 'Optimism',
  [CHAIN.POLYGON]: 'Polygon',
};

interface IHistory {
  chain: string;
  feeUsdAmount: number;
  intervalTimestamp: number;
}

const fetch = async (_: number, _a: any, options: FetchOptions) => {
  const chain = chains[options.chain];
  const dayTimestamp = options.startOfDay
  const historical: IHistory[] = (await fetchURL(poolsDataEndpoint)).items;
  const historicalVolume = historical
    .filter(e => e.chain.toLowerCase() === chain.toLowerCase());
  const dailyFees = historicalVolume
    .find(dayItem => (new Date(dayItem.intervalTimestamp).getTime() / 1000) === dayTimestamp)?.feeUsdAmount

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: "0",
  };
};

const methodology = {
  UserFees: "Users pay 0.3% swap fees",
  Fees: "A 0.3% fee is collected from each swap",
  SupplySideRevenue: "All fees go to LPs",
  Revenue: "No revenue"
}

const adapter: Adapter = {
  version: 1,
  methodology,
  chains: [CHAIN.ARBITRUM, CHAIN.AURORA, CHAIN.AVAX, CHAIN.BOBA, CHAIN.BSC, CHAIN.ETHEREUM, CHAIN.FANTOM, CHAIN.FRAXTAL, CHAIN.HARMONY, CHAIN.MOONBEAM, CHAIN.MOONRIVER, CHAIN.OPTIMISM, CHAIN.POLYGON],
  fetch,
  adapter: {}
}

export default adapter;
