import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.BSC,
  CHAIN.FANTOM,
  CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.LINEA,
  CHAIN.SCROLL,
  CHAIN.ZKSYNC,
  CHAIN.CRONOS,
];

const chainToId: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.BSC]: 56,
  [CHAIN.FANTOM]: 250,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.POLYGON]: 137,
  [CHAIN.LINEA]: 59144,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.ZKSYNC]: 324,
  [CHAIN.CRONOS]: 25,
};

const fetch = (chain: string) => async (timestamp: number) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  try {
    const data = (
      await fetchURL(
        `https://common-service.kyberswap.com/api/v1/aggregator/volume/daily?chainId=${chainToId[chain]}&timestamps=${unixTimestamp}`
      )
    ).data.data?.volumes?.[0];

    return {
      dailyVolume: data?.value ?? "0",
      timestamp: unixTimestamp,
    };
  } catch (e) {
    console.log(e);
    return {
      dailyVolume: "0",
      timestamp: unixTimestamp,
    };
  }
};

const adapter: any = {
  adapter: {
    ...chains.reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetch(chain),
          start: async () => 1685491200,
        },
      };
    }, {}),
  },
};

export default adapter;
