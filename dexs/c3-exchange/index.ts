import {
  Adapter,
  BaseAdapter,
  FetchOptions,
  FetchResultV2,
  FetchV2,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const barsEndpoint = "https://api.c3.io/v1/markets/{id}/bars";

const ONE_DAY_IN_MILISECONDS = 60 * 60 * 24 * 1000;
const HALF_DAY_IN_MILISECONDS = ONE_DAY_IN_MILISECONDS / 2;

const marketsOfChains = {
  [CHAIN.ALGORAND]: ["ALGO-USDC"],
  [CHAIN.AVAX]: ["AVAX-USDC"],
  [CHAIN.BITCOIN]: ["WBTC-USDC"],
  [CHAIN.ETHEREUM]: ["ETH-USDC"],
  [CHAIN.ARBITRUM]: ["ARB-USDC"],
  [CHAIN.BSC]: ["BNB-USDC"],
  [CHAIN.SOLANA]: ["SOL-USDC", "PYTH-USDC", "W-USDC"],
};

async function fetchVolume({
  chain,
  startOfDay,
}: FetchOptions): Promise<FetchResultV2> {
  const markets = marketsOfChains[chain];

  const from = Math.floor(startOfDay) * 1000 - HALF_DAY_IN_MILISECONDS;
  const to = Math.floor(startOfDay) * 1000 + HALF_DAY_IN_MILISECONDS;
  const barsPromises = markets.map((market) => {
    const endpoint = barsEndpoint.replace("{id}", market);
    const url = `${endpoint}?from=${from}&to=${to}&granularity=1D`;
    return fetchURL(url);
  });

  const volume24h = (await Promise.all(barsPromises)).reduce((acc, bars) => {
    const last = bars[bars.length - 1];
    const quoteVolume = last?.quoteVolume ?? 0;
    return acc + +quoteVolume;
  }, 0);

  return {
    dailyVolume: Math.round(volume24h),
    timestamp: startOfDay,
  };
}

function adapterConstructor(
  fetchVolumeFunc: FetchV2,
  chains: string[]
): Adapter {
  const chainVolumes: BaseAdapter = chains.reduce(
    (obj, chain) => ({
      ...obj,
      [chain]: {
        fetch: fetchVolumeFunc,
        start: '2023-07-01', // 1st July 2023, 00:00:00 GMT
        // runAtCurrTime: false,
      },
    }),
    {}
  );

  return {
    methodology: {
      dailyVolume: "Volume is calculated by summing the quote token volume of all trades settled on the protocol that day.",
    },
    version: 2,
    adapter: chainVolumes,
  };
}

const adapter: Adapter = adapterConstructor(
  fetchVolume,
  Object.keys(marketsOfChains)
);

export default adapter;
