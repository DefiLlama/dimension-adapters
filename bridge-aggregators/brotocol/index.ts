import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface ApiResponse {
  day: string;
  volume: number;
}

const chains: Record<string, string> = {
  [CHAIN.AILAYER]: 'AILayer',
  [CHAIN.ARBITRUM]: 'Arbitrum',
  [CHAIN.AURORA]: 'Aurora',
  [CHAIN.AVAX]: 'AVAX',
  [CHAIN.BASE]: 'Base',
  [CHAIN.BITCOIN]: 'Bitcoin',
  [CHAIN.BITLAYER]: 'Bitlayer',
  [CHAIN.BSC]: 'BNB',
  [CHAIN.BOB]: 'BOB',
  [CHAIN.BRC20]: 'BRC20',
  [CHAIN.BSQUARED]: 'Bsquared',
  [CHAIN.CORE]: 'CORE',
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.LINEA]: 'Linea',
  [CHAIN.LORENZO]: 'Lorenzo',
  [CHAIN.MANTA]: 'Manta',
  [CHAIN.MERLIN]: 'Merlin',
  [CHAIN.MEZO]: 'Mezo',
  [CHAIN.MODE]: 'MODE',
  [CHAIN.RUNES]: 'Runes',
  [CHAIN.SOLANA]: 'Solana',
  [CHAIN.STACKS]: 'Stacks',
  [CHAIN.XLAYER]: 'Xlayer',
};


const api = "https://api.brotocol.xyz/v1/xlink/bridge-chain-volume-by-day"

const fetch = async (options: FetchOptions) => {
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const data: ApiResponse = await fetchURL(`${api}?day=${dateStr}&chain=${chains[options.chain]}`)
  return { dailyBridgeVolume: data.volume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const [key, value] = chain;
      return {
        ...acc,
        [key]: {
          runAtCurrTime: true,
          fetch,
          start: "2023-04-17",
        },
      };
    }, {}),
  },
};

export default adapter;
