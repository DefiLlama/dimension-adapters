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
  [CHAIN.BSQUARED]: 'Bsquared',
  [CHAIN.CORE]: 'CORE',
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.LINEA]: 'Linea',
  [CHAIN.MANTA]: 'Manta',
  [CHAIN.MERLIN]: 'Merlin',
  [CHAIN.MEZO]: 'Mezo',
  [CHAIN.MODE]: 'MODE',
  [CHAIN.SOLANA]: 'Solana',
  [CHAIN.STACKS]: 'Stacks',
  [CHAIN.XLAYER]: 'Xlayer',
  
  // dead chains
  // [CHAIN.LORENZO]: 'Lorenzo',
  // [CHAIN.RUNES]: 'Runes',
  // [CHAIN.BRC20]: 'BRC20',
};


const api = "https://api.brotocol.xyz/v1/xlink/bridge-chain-volume-by-day"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const data: ApiResponse = await fetchURL(`${api}?day=${dateStr}&chain=${chains[options.chain]}`)
  return { dailyBridgeVolume: data.volume }
}

const adapter: SimpleAdapter = {
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const [key, _] = chain;
      return {
        ...acc,
        [key]: {
          fetch,
          runAtCurrTime: true,
          // start: "2023-04-17",
        },
      };
    }, {}),
  },
};

export default adapter;
