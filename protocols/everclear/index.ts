import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (
  options: FetchOptions,
  windowDays = 1, //optional
) => {
  const dailyVolume = options.createBalances();
  const now = Math.floor(Date.now() / 1000); //conversion from miliseconds-timestamp to seconds-timestamp
  
  // 1 day back in Seconds
  const windowSeconds = windowDays * 24 * 60 * 60;
  const endDate = now;
  const startDate = (now - windowSeconds);

  const url = `https://api.everclear.org/intents?startDate=${startDate}&endDate=${endDate}&limit=1000000&statuses=SETTLED_AND_COMPLETED`;

  try {
    const response = await fetchURL(url);

    for (const intent of response.intents) {
      if (intent.status !== "SETTLED_AND_COMPLETED") continue;

      // get amount, asset and chain
      const originAmount = intent.origin_amount;
      let assetContract = intent.input_asset;

      // xpufETH will use pufETH address to fetch price
      if (
        assetContract ===
        "0xd7d2802f6b19843ac4dfe25022771fd83b5a7464"
      ) {
        assetContract =
          "0xd9a442856c234a39a81a089c06451ebaa4306a72";
      }

      const chain = intent.origin;

      dailyVolume.add(assetContract, originAmount, chain);

    }

    return { dailyVolume };
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.OPTIMISM]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.ARBITRUM]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.BASE]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.POLYGON]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.BSC]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.UNICHAIN]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.ZKSYNC]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.RONIN]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.APECHAIN]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.MODE]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.AVAX]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.ZIRCUIT]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.LINEA]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.BLAST]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.TAIKO]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.SCROLL]: {fetch, start: 1726542000, runAtCurrTime: false},
    [CHAIN.SOLANA]: {fetch, start: 1726542000, runAtCurrTime: false},
  },
};

export default adapter;