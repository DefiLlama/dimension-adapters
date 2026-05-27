import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const URL = "https://open-api.openocean.finance/v3";
const CHAINS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "2022-01-01",
  [CHAIN.BSC]: "2022-01-01",
  [CHAIN.POLYGON]: "2022-01-01",
  [CHAIN.AVAX]: "2022-01-01",
  [CHAIN.FANTOM]: "2022-01-01",
  [CHAIN.ARBITRUM]: "2022-01-01",
  [CHAIN.OPTIMISM]: "2022-01-01",
  [CHAIN.ERA]: "2022-01-01",
  [CHAIN.BASE]: "2022-01-01",
  [CHAIN.OP_BNB]: "2022-01-01",
  [CHAIN.LINEA]: "2022-01-01",
  [CHAIN.MANTLE]: "2022-01-01",
  [CHAIN.MANTA]: "2022-01-01",
  [CHAIN.TELOS]: "2022-01-01",
  [CHAIN.SCROLL]: "2022-01-01",
  [CHAIN.XDAI]: "2022-01-01",
  [CHAIN.CRONOS]: "2022-01-01",
  [CHAIN.HARMONY]: "2022-01-01",
  [CHAIN.BLAST]: "2022-01-01",
  [CHAIN.MODE]: "2022-01-01",
  // [CHAIN.ROOTSTOCK]: "2022-01-01",
  // [CHAIN.SEI]: "2022-01-01",
  [CHAIN.GRAVITY]: "2022-01-01",
  [CHAIN.KAVA]: "2022-01-01",
  [CHAIN.METIS]: "2022-01-01",
  [CHAIN.CELO]: "2022-01-01",
  [CHAIN.POLYGON_ZKEVM]: "2022-01-01",
  [CHAIN.MOONRIVER]: "2022-01-01",
  [CHAIN.AURORA]: "2022-01-01",
  [CHAIN.APECHAIN]: "2022-01-01",
  [CHAIN.SONIC]: "2022-01-01",
  [CHAIN.BERACHAIN]: "2022-01-01",
  [CHAIN.UNICHAIN]: "2022-01-01",
  [CHAIN.FLARE]: "2022-01-01",
  [CHAIN.SWELLCHAIN]: "2022-01-01",
  [CHAIN.HYPERLIQUID]: "2022-01-01",
  [CHAIN.MONAD]: "2025-05-17",
  [CHAIN.SOLANA]: "2025-05-17",
  [CHAIN.APTOS]: "2025-05-17",
  [CHAIN.SUI]: "2025-05-17",
  [CHAIN.NEAR]: "2025-05-17",
  [CHAIN.STARKNET]: "2025-05-17",
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { data } = await fetchURL(`${URL}/${options.chain}/getDailyVolume?timestamp=${options.startOfDay}`);
  const { dailyVolume } = data || { dailyVolume: 0 };
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    ...Object.entries(CHAINS).reduce((acc, [chain, _]) => {
      return {
        ...acc,
        [chain]: {
          fetch,
          start: CHAINS[chain],
        },
      };
    }, {})
  }
};

export default adapter;
