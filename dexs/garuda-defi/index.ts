import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";

const endpoints = {
  terra: "https://server-grdx-api.nexora-tech.org/graphql", 
};

const historicalData = gql`
  query get_volume($from: Float!, $to: Float!) {
    historicalData(from: $from, to: $to) {
      volumeUST
      timestamp
    }
  }
`;

interface IHistoricalDataResponse {
  historicalData: Array<{
    volumeUST: number;
    timestamp: number;
  }>;
}

const fetch = async (options: FetchOptions) => {
  const data: IHistoricalDataResponse = await request(endpoints.terra, historicalData, {
    from: options.startOfDay,
    to: options.startOfDay + 86400,
  });
  
  return {
    dailyVolume: data.historicalData[0]?.volumeUST || 0
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TERRA],
  start: '2025-02-11',
};

export default adapter;
