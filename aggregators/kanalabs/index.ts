import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = "https://stats.kanalabs.io/transaction/volume";
const TRADE_URL = "https://stats.kanalabs.io/trade/volume";

export enum KanaChainID {
  "solana" = 1,
  "aptos" = 2,
  "polygon" = 3,
  "ethereum" = 4,
  "bsc" = 5,
  "klaytn" = 6,
  "sui" = 8,
  "Arbitrum" = 9,
  "Avalanche" = 10,
  "zkSync" = 11,
  "base" = 12,
}

const fetch =
  (chain: KanaChainID, isTrade?: Boolean) => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    let data: any;
    try {
      if (isTrade) {
        data = await fetchURL(
          `${TRADE_URL}?timestamp=${timestamp}&chainId=${chain}`
        );
      } else {
        data = await fetchURL(`${URL}?timestamp=${timestamp}&chainId=${chain}`);
      }

      return {
        timestamp: dayTimestamp,
        dailyVolume: data.today.volume,
        totalVolume: data.totalVolume.volume,
      };
    } catch (err) {
      console.log(err);
      return {
        timestamp: dayTimestamp,
        dailyVolume: "0",
        totalVolume: "0",
      };
    }
  };

const startTimeBlock = 1695897800;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(KanaChainID.ethereum),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.BSC]: {
      fetch: fetch(KanaChainID.bsc),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(KanaChainID.Avalanche),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(KanaChainID.Arbitrum),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(KanaChainID.polygon),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.ZKSYNC]: {
      fetch: fetch(KanaChainID.zkSync),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.APTOS]: {
      fetch: fetch(KanaChainID.aptos),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.SUI]: {
      fetch: fetch(KanaChainID.sui),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
  },
};

// Export the adapter
export default adapter;
