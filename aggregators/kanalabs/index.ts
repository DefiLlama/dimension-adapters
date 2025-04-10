import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

const URL = "https://stats.kanalabs.io/transaction/volume";
const TRADE_URL = "https://stats.kanalabs.io/trade/volume";
const GRAPHQL_URL = "https://api-mainnet.kanalabs.io/graphql";

export enum KanaChainID {
  "solana" = 1,
  "aptos" = 2,
  "polygon" = 3,
  "bsc" = 4,
  "sui" = 5,
  "ethereum" = 6,
  "base" = 7,
  "klaytn" = 8,
  "zkSync" = 9,
  "Avalanche" = 10,
  "Arbitrum" = 11,
  "optimistic" = 12,
}

const fetch = (chain: KanaChainID) => async (timestamp: number, t: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay + 86400;
  const data = await fetchURL(
    `${URL}?timestamp=${dayTimestamp - 1}&chainId=${chain}`
  );
  return {
    timestamp: timestamp,
    dailyVolume: data.today.volume,
    totalVolume: data.totalVolume.volume,
  };
};

const fetchAptos = async (timestamp: number, t: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay + 86400;
  const query = gql`
    query getTransactionVolumesForTransactions($timestamp: Float!, $chainId: Float!) {
      getTransactionVolumesForTransactions(timestamp: $timestamp, chainId: $chainId)
    }
  `;
  const variables = {
    timestamp: dayTimestamp - 1,
    chainId: KanaChainID.aptos,
  };
  const data = await request(GRAPHQL_URL, query, variables);
  
  const result = data.getTransactionVolumesForTransactions;
  
  return {
    timestamp: timestamp,
    dailyVolume: result.today.volume,
    totalVolume: result.totalVolume.volume,
  };
};

const startTimeBlock = 1695897800;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(KanaChainID.ethereum),
      start: startTimeBlock,
    },
    [CHAIN.BSC]: {
      fetch: fetch(KanaChainID.bsc),
      start: startTimeBlock,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(KanaChainID.Avalanche),
      start: startTimeBlock,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(KanaChainID.Arbitrum),
      start: startTimeBlock,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(KanaChainID.polygon),
      start: startTimeBlock,
    },
    [CHAIN.ERA]: {
      fetch: fetch(KanaChainID.zkSync),
      start: startTimeBlock,
    },
    [CHAIN.APTOS]: {
      fetch: async (timestamp: number, t: any, options: FetchOptions) => {
        const swap = await fetchAptos(options.startOfDay, t, options);
        return {
          dailyVolume: swap.dailyVolume.toString(),
          totalVolume: swap.totalVolume.toString(),
          timestamp,
        };
      },
      start: startTimeBlock,
    },
    [CHAIN.SUI]: {
      fetch: fetch(KanaChainID.sui),
      start: startTimeBlock,
    },
    [CHAIN.SOLANA]: {
      fetch: fetch(KanaChainID.solana),
      start: startTimeBlock,
    },
  },
};

export default adapter;