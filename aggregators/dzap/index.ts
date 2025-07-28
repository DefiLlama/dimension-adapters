import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const CHAIN_VOLUME_API = "https://api.dzap.io/v1/volume/chain";

const chains: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.FLARE]: 14,
  [CHAIN.CRONOS]: 25,
  [CHAIN.ROOTSTOCK]: 30,
  [CHAIN.TELOS]: 40,
  [CHAIN.BSC]: 56,
  // [CHAIN.GNOSIS]: 100,
  [CHAIN.FUSE]: 122,
  [CHAIN.POLYGON]: 137,
  [CHAIN.SONIC]: 146,
  [CHAIN.MANTA]: 169,
  [CHAIN.MINT]: 185,
  [CHAIN.XLAYER]: 196,
  [CHAIN.FANTOM]: 250,
  [CHAIN.FRAXTAL]: 252,
  [CHAIN.KROMA]: 255,
  [CHAIN.ZKSYNC]: 324,
  [CHAIN.METIS]: 1088,
  [CHAIN.POLYGON_ZKEVM]: 1101,
  [CHAIN.CORE]: 1116,
  [CHAIN.MOONBEAM]: 1284,
  [CHAIN.MOONRIVER]: 1285,
  [CHAIN.SEI]: 1329,
  [CHAIN.STORY]: 1514,
  [CHAIN.GRAVITY]: 1625,
  [CHAIN.SONEIUM]: 1868,
  [CHAIN.KAVA]: 2222,
  [CHAIN.MORPH]: 2818,
  [CHAIN.MERLIN]: 4200,
  [CHAIN.MANTLE]: 5000,
  // [CHAIN.ZETACHAIN]: 7000,
  [CHAIN.BASE]: 8453,
  // [CHAIN.ARTHERA]: 10242,
  [CHAIN.MODE]: 34443,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.CELO]: 42220,
  [CHAIN.HEMI]: 43111,
  [CHAIN.AVAX]: 43114,
  [CHAIN.INK]: 57073,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BERACHAIN]: 80094,
  [CHAIN.BLAST]: 81457,
  [CHAIN.TAIKO]: 167000,
  [CHAIN.BITLAYER]: 200901,
  [CHAIN.SCROLL]: 534352,
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

async function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time * 1000));
}

const fetch = (chain: number) => async (options: FetchOptions) => {
  await sleep(2);
  const data: ApiResponse = await fetchURL(
    `${CHAIN_VOLUME_API}?chainId=${chain}`
  );

  let dailyVolume = data.swap.last24Hours;

  // bad data, wash trade
  if (options.startOfDay === 1750982400 && options.chain === CHAIN.ARBITRUM) {
    dailyVolume = 0;
  }

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const [key, value] = chain;
      return {
        ...acc,
        [key]: {
          runAtCurrTime: true,
          fetch: fetch(value),
          start: "2023-01-01",
          meta: {
            methodology: {
              Volume:
                "Volume data is retrieved from DZap's chain volume API endpoint.",
            },
          },
        },
      };
    }, {}),
  },
};

export default adapter;
