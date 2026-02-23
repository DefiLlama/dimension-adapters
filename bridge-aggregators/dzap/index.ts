import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const CHAIN_VOLUME_API = "https://api.dzap.io/v1/volume/chain";

const chains: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.FLARE]: 14,
  [CHAIN.CRONOS]: 25,
  [CHAIN.ROOTSTOCK]: 30,
  [CHAIN.TELOS]: 40,
  [CHAIN.XDC]: 50,
  [CHAIN.BSC]: 56,
  [CHAIN.XDAI]: 100,
  [CHAIN.FUSE]: 122,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.MONAD]: 143,
  [CHAIN.POLYGON]: 137,
  [CHAIN.SONIC]: 146,
  [CHAIN.MANTA]: 169,
  [CHAIN.MINT]: 185,
  [CHAIN.XLAYER]: 196,
  [CHAIN.OP_BNB]: 204,
  [CHAIN.BSQUARED]: 223,
  [CHAIN.LENS]: 232,
  [CHAIN.FANTOM]: 250,
  [CHAIN.FRAXTAL]: 252,
  [CHAIN.KROMA]: 255,
  [CHAIN.BOBA]: 288,
  [CHAIN.ZKSYNC]: 324,
  [CHAIN.PULSECHAIN]: 369,
  [CHAIN.WC]: 480,
  [CHAIN.STABLE]: 988,
  [CHAIN.HYPERLIQUID]: 998,
  [CHAIN.BITCOIN]: 1000,
  [CHAIN.METIS]: 1088,
  [CHAIN.POLYGON_ZKEVM]: 1101,
  [CHAIN.CORE]: 1116,
  [CHAIN.MOONBEAM]: 1284,
  [CHAIN.MOONRIVER]: 1285,
  [CHAIN.SEI]: 1329,
  [CHAIN.STORY]: 1514,
  [CHAIN.GRAVITY]: 1625,
  [CHAIN.SONEIUM]: 1868,
  [CHAIN.SWELLCHAIN]: 1923,
  [CHAIN.RONIN]: 2020,
  [CHAIN.KAVA]: 2222,
  [CHAIN.ABSTRACT]: 2741,
  [CHAIN.MORPH]: 2818,
  [CHAIN.MERLIN]: 4200,
  [CHAIN.MEGAETH]: 4326,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.BAHAMUT]: 5165,
  [CHAIN.ZETA]: 7000,
  [CHAIN.BASE]: 8453,
  [CHAIN.KLAYTN]: 8217,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.IMX]: 13371,
  [CHAIN.SUI]: 19219,
  [CHAIN.APECHAIN]: 33139,
  [CHAIN.MODE]: 34443,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.CELO]: 42220,
  [CHAIN.ZKFAIR]: 42766,
  [CHAIN.HEMI]: 43111,
  [CHAIN.AVAX]: 43114,
  [CHAIN.ZIRCUIT]: 48900,
  [CHAIN.SUPERPOSITION]: 55244,
  [CHAIN.INK]: 57073,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BOB]: 60808,
  [CHAIN.BERACHAIN]: 80094,
  [CHAIN.BLAST]: 81457,
  [CHAIN.PLUME]: 98866,
  [CHAIN.TAIKO]: 167000,
  [CHAIN.BITLAYER]: 200901,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.KATANA]: 747474,
  [CHAIN.SOLANA]: 7565164,
  [CHAIN.AURORA]: 1313161554,
};

interface ApiResponse {
  swap: {
    allTime: number;
    last24Hours: number;
    last7Days: number;
    last30Days: number;
    last90Days: number;
  };
  bridge: {
    allTime: number;
    last24Hours: number;
    last7Days: number;
    last30Days: number;
    last90Days: number;
  };
}

const prefetch = async (options: FetchOptions) => {
  const data = {};
  for (const chain of Object.keys(chains)) {
    await new Promise((resolve) => setTimeout(resolve, 13000));
    data[chain] = await httpGet(
      `${CHAIN_VOLUME_API}?chainId=${chains[chain as keyof typeof chains]}`,
    );
  }
  return data;
};

const fetch = async (options: FetchOptions) => {
  const data: ApiResponse = options.preFetchedResults[options.chain];

  return {
    dailyBridgeVolume: data.bridge.last24Hours,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: Object.keys(chains),
  start: "2023-01-01",
  prefetch,
  runAtCurrTime: true,
};

export default adapter;
