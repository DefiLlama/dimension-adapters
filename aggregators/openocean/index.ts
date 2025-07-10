import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const URL = "https://open-api.openocean.finance/v3";
const contract_addresses: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.BSC]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.POLYGON]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.AVAX]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.FANTOM]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.ARBITRUM]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.OPTIMISM]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.ERA]: "0x36A1aCbbCAfca2468b85011DDD16E7Cb4d673230",
  [CHAIN.BASE]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.OP_BNB]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.LINEA]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.MANTLE]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.MANTA]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.TELOS]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.SCROLL]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.XDAI]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.CRONOS]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.HARMONY]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.BLAST]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.MODE]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  // [CHAIN.ROOTSTOCK]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.SEI]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.GRAVITY]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.KAVA]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.METIS]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.CELO]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.POLYGON_ZKEVM]: "0x6dd434082EAB5Cd134B33719ec1FF05fE985B97b",
  [CHAIN.MOONRIVER]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.AURORA]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.APECHAIN]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.SONIC]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.BERACHAIN]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.UNICHAIN]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.FLARE]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.SWELLCHAIN]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
  [CHAIN.HYPERLIQUID]: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64"
};

const chain_date: Record<string, string> = {
  [CHAIN.SOLANA]: "2025-05-17",
  [CHAIN.APTOS]: "2025-05-17",
  [CHAIN.SUI]: "2025-05-17",
  [CHAIN.NEAR]: "2025-05-17",
  [CHAIN.STARKNET]: "2025-05-17",
};

const fetch = async (options: FetchOptions) => {
  if (chain_date[options.chain]) {
    const { data } = await fetchURL(`${URL}/${options.chain}/getDailyVolume?timestamp=${options.startOfDay}`);
    const { dailyVolume } = data || { dailyVolume: 0 };
    return { dailyVolume };
  }
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: contract_addresses[options.chain],
    eventAbi:
      "event Swapped(address indexed sender,address indexed srcToken,address indexed dstToken,address dstReceiver,uint256 amount,uint256 spentAmount,uint256 returnAmount,uint256 minReturnAmount,uint256 guaranteedAmount,address referrer)",
  });

  logs.forEach((log) => {
    dailyVolume.add(log.dstToken, log.returnAmount);
  });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.entries(contract_addresses).reduce((acc, [chain, _]) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetch,
        },
      };
    }, {}),
    ...Object.entries(chain_date).reduce((acc, [chain, _]) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetch,
          start: chain_date[chain],
        },
      };
    }, {})
  }
};

export default adapter;
