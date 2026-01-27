import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GRAPHQL_URL = "https://api-mainnet.kanalabs.io/graphql";

export enum KanaChainID {
  "aptos" = 2
}

const fetch = async (timestamp: number, t: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay + 86400;
  const query = gql`
    query getDefillamaVolumeForPerps($timestamp: Float!, $chainId: Float!) {
      getDefillamaVolumeForPerps(timestamp: $timestamp, chainId: $chainId)
    }
  `;
  const variables = {
    timestamp: dayTimestamp - 1,
    chainId: KanaChainID.aptos,
  };
  const data = await request(GRAPHQL_URL, query, variables);
  const result = data.getDefillamaVolumeForPerps;

  return {
    dailyVolume: result.today.volume,
  };
};

const startTimeBlock = 1695897800;

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-09-12',
    },
  },
};

export default adapter;
