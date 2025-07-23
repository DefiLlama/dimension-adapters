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
    dailyVolume: data.today.volume,
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
    dailyVolume: result.today.volume,
  };
};

const start = '2023-09-08';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(KanaChainID.ethereum),
      start: start,
    },
    [CHAIN.BSC]: {
      fetch: fetch(KanaChainID.bsc),
      start: start,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(KanaChainID.Avalanche),
      start: start,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(KanaChainID.Arbitrum),
      start: start,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(KanaChainID.polygon),
      start: start,
    },
    [CHAIN.ERA]: {
      fetch: fetch(KanaChainID.zkSync),
      start: start,
    },
    [CHAIN.APTOS]: {
      fetch: async (timestamp: number, t: any, options: FetchOptions) => {
        const swap = await fetchAptos(options.startOfDay, t, options);
        return {
          dailyVolume: swap.dailyVolume.toString(),
        };
      },
      start: start,
    },
    [CHAIN.SUI]: {
      fetch: fetch(KanaChainID.sui),
      start: start,
    },
    [CHAIN.SOLANA]: {
      fetch: fetch(KanaChainID.solana),
      start: start,
    },
  },
};

export default adapter;