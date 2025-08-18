import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const baseURL = 'https://swap.prod.swing.xyz'
const chains: Record<string, string> = {
  [CHAIN.SOLANA]: 'solana',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.BSC]: 'bsc',
  [CHAIN.AVAX]: 'avalanche',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.ARCHWAY]: 'archway-1',
  [CHAIN.BSQUARED]: 'b2-network',
  [CHAIN.BASE]: 'base',
  [CHAIN.BITCOIN]: 'bitcoin',
  [CHAIN.BITLAYER]: 'bitlayer',
  [CHAIN.BLAST]: 'blast',
  [CHAIN.BOB]: 'bob',
  [CHAIN.CORE]: 'core-blockchain',
  [CHAIN.COSMOS]: 'cosmoshub-4',
  [CHAIN.FANTOM]: 'fantom',
  [CHAIN.XDAI]: 'gnosis',
  [CHAIN.GRAVITY]: 'gravity',
  [CHAIN.INJECTIVE]: 'injective-1',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.MANTA]: 'manta-pacific',
  [CHAIN.MANTLE]: 'mantle',
  [CHAIN.METIS]: 'metis',
  [CHAIN.MODE]: 'mode',
  [CHAIN.MOONBEAM]: 'moonbeam',
  [CHAIN.MORPH]: 'morph',
  [CHAIN.CELESTIA]: 'cataclysm-1',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.OSMOSIS]: 'osmosis-1',
  [CHAIN.SCROLL]: 'scroll',
  [CHAIN.TAIKO]: 'taiko',
  [CHAIN.WC]: 'world-chain',
  [CHAIN.ZKSYNC]: 'zksync-era',
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startOfDay = options.startOfDay;
  const endOfDay = startOfDay + 24 * 60 * 60;

  const dailyRes = await httpGet(`${baseURL}/v0/metrics/stats`, {
    headers: {
      'Content-Type': 'application/json',
    },
    params: { startDate: startOfDay, endDate: endOfDay },
  });

  const sameChainVolumes = dailyRes?.historicalVolumeSamechain?.map((history: any) => {
    const chainVol = history?.volume?.find((vol: any) => {
      return vol?.chainSlug?.toLowerCase() === chains[options.chain].toLowerCase();
    })

    return chainVol;
  });

  // calculate the total volume
  const chainVol = sameChainVolumes?.reduce((acc: number, curr: any) => {
    return acc + Number(curr?.value || 0);
  }, 0);


  return {
    dailyVolume: chainVol || 0,
  };
};

const startDate = '2022-11-01'
const chainAdapters = {
  ...Object.entries(chains).reduce((acc, chain) => {
    const [key, value] = chain;
    return {
      ...acc,
      [key]: {
        fetch: fetch,
        start: startDate

      },
    };
  }, {})
}

const adapter = {
  version: 1,
  adapter: chainAdapters
};

export default adapter;
