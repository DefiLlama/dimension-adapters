import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

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

const fetch = (chain: KanaChainID) => async (timestamp: number) => {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const data = await fetchURL(
    `${URL}?timestamp=${dayTimestamp - 1}&chainId=${chain}`
  );
  return {
    timestamp: timestamp,
    dailyVolume: data.today.volume,
    totalVolume: data.totalVolume.volume,
  };
};

const fetchDerivatives = (chain: KanaChainID) => async (timestamp: number) => {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const data = await fetchURL(
    `${TRADE_URL}?timestamp=${dayTimestamp - 1}&chainId=${chain}`
  );
  return {
    timestamp: timestamp,
    dailyVolume: data.today.volume,
    totalVolume: data.totalVolume.volume,
  };
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
    [CHAIN.ERA]: {
      fetch: fetch(KanaChainID.zkSync),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.APTOS]: {
      fetch: async (timestamp: number) => {
        const swap = await fetch(KanaChainID.aptos)(timestamp);
        const trade = await fetchDerivatives(KanaChainID.aptos)(timestamp);
        return {
          dailyVolume: (+swap.dailyVolume + +trade.dailyVolume).toString(),
          totalVolume: (+swap.totalVolume + +trade.totalVolume).toString(),
          timestamp,
        };
      },
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.SUI]: {
      fetch: fetch(KanaChainID.sui),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
    [CHAIN.SOLANA]: {
      fetch: fetch(KanaChainID.solana),
      runAtCurrTime: false,
      start: startTimeBlock,
    },
  },
};

// Export the adapter
export default adapter;
