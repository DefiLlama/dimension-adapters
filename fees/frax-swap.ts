import { CHAIN } from "../helpers/chains";
import { FetchOptions, Adapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const poolsDataEndpoint = "https://api.frax.finance/v2/fraxswap/history?range=all"

const chains: Record<string, { name: string, start: string }> = {
  [CHAIN.ARBITRUM]: { name: 'Arbitrum', start: '2022-05-23' },
  [CHAIN.AURORA]: { name: 'Aurora', start: '2022-01-18' },
  [CHAIN.AVAX]: { name: 'Avalanche', start: '2022-05-23' },
  [CHAIN.BOBA]: { name: 'Boba', start: '2021-12-27' },
  [CHAIN.BSC]: { name: 'BSC', start: '2021-12-19' },
  [CHAIN.ETHEREUM]: { name: 'Ethereum', start: '2022-05-14' },
  [CHAIN.FANTOM]: { name: 'Fantom', start: '2022-05-22' },
  [CHAIN.FRAXTAL]: { name: 'Fraxtal', start: '2024-02-22' },
  [CHAIN.HARMONY]: { name: 'Harmony', start: '2022-01-12' },
  [CHAIN.MOONBEAM]: { name: 'Moonbeam', start: '2022-01-14' },
  [CHAIN.MOONRIVER]: { name: 'Moonriver', start: '2021-12-30' },
  [CHAIN.OPTIMISM]: { name: 'Optimism', start: '2022-10-28' },
  [CHAIN.POLYGON]: { name: 'Polygon', start: '2022-05-22' },
};

interface IHistory {
  chain: string;
  feeUsdAmount: number;
  intervalTimestamp: number;
}

const fetch = async (options: FetchOptions) => {
  const chain = chains[options.chain].name;
  const dayTimestamp = options.startOfDay
  const historical: IHistory[] = (await fetchURL(poolsDataEndpoint)).items;
  const historicalVolume = historical
    .filter(e => e.chain.toLowerCase() === chain.toLowerCase());
  const feeUsdAmount = historicalVolume
    .find(dayItem => (new Date(dayItem.intervalTimestamp).getTime() / 1000) === dayTimestamp)?.feeUsdAmount ?? 0

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(feeUsdAmount, 'Fraxswap Fees');
  dailySupplySideRevenue.addUSDValue(feeUsdAmount, 'Fraxswap Fees To LPs');

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
  };
};

const methodology = {
  UserFees: "Users pay 0.3% swap fees",
  Fees: "A 0.3% fee is collected from each swap",
  SupplySideRevenue: "All fees go to LPs",
  Revenue: "No revenue"
}

const breakdownMethodology = {
  UserFees: {
    'Fraxswap Fees': "0.3% fee paid by users on each token swap"
  },
  Fees: {
    'Fraxswap Fees': "0.3% fee collected from each token swap"
  },
  SupplySideRevenue: {
    'Fraxswap Fees To LPs': "100% of swap fees distributed to liquidity providers"
  }
}

const adapter: Adapter = {
  version: 1,
  methodology,
  breakdownMethodology,
  adapter: Object.keys(chains).reduce((all, chain) => {
    all[chain] = { fetch, start: chains[chain].start }
    return all
  }, {} as any),
}

export default adapter;
