import fetchURL from "../../utils/fetchURL";
import {  SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://stats.kanalabs.io/transaction/volume";

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
  try {
    const data = (await fetchURL(`${URL}?chainId=${chain}`)).data;
    return {
      timestamp,
      dailyVolume: data.today.volume,
      totalVolume: data.totalVolume.volume,
    };
  } catch (err) {
    console.log(err)
    return {
      timestamp,
      dailyVolume: "0",
      totalVolume: "0",
    };
  }
};

// Define the adapter
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(KanaChainID.ethereum),
      runAtCurrTime: false,
      start: async () => 1695897839,
    },
    [CHAIN.BSC]: {
      fetch: fetch(KanaChainID.bsc),
      runAtCurrTime: true,
      start: async () => 1695897839,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(KanaChainID.Avalanche),
      runAtCurrTime: true,
      start: async () => 1695897839,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(KanaChainID.Arbitrum),
      runAtCurrTime: true,
      start: async () => 1695897839,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(KanaChainID.polygon),
      runAtCurrTime: true,
      start: async () => 1695897839,
    },
    [CHAIN.ZKSYNC]: {
      fetch: fetch(KanaChainID.zkSync),
      runAtCurrTime: true,
      start: async () => 1695897839,
    },
  },
};

// Export the adapter
export default adapter;