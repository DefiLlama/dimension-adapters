import fetchURL from "../../utils/fetchURL"
import { Chain, FetchOptions } from "../../adapters/types";
import { FetchResult, SimpleAdapter, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const poolsDataEndpoint = "https://api.frax.finance/v2/fraxswap/history?range=all"

type TChains = {
  [chain: string | Chain]: string;
}
const chains: TChains = {
  [CHAIN.ARBITRUM]: 'Arbitrum',
  [CHAIN.AURORA]: 'Aurora',
  [CHAIN.AVAX]: 'Avalanche',
  [CHAIN.BOBA]: 'Boba',
  [CHAIN.BSC]: 'BSC',
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.FANTOM]: 'Fantom',
  [CHAIN.HARMONY]: 'Harmony',
  [CHAIN.MOONBEAM]: 'Moonbeam',
  [CHAIN.MOONRIVER]: 'Moonriver',
  [CHAIN.POLYGON]: 'Polygon',
  [CHAIN.FRAXTAL]: 'Fraxtal',
  [CHAIN.OPTIMISM]: 'Optimism',
};

interface IVolumeall {
  chain: string;
  swapVolumeUsdAmount: number;
  intervalTimestamp: number;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const historical: IVolumeall[] = (await fetchURL(poolsDataEndpoint)).items;
  const historicalVolume = historical
    .filter(e => e.chain.toLowerCase() === chains[options.chain].toLowerCase());

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.intervalTimestamp).getTime() / 1000) === options.startOfDay)?.swapVolumeUsdAmount

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: Object.keys(chains),
};

export default adapter;
