import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

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

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const data: IHistoricalDataResponse = await request(endpoints.terra, historicalData, {
    from: dayTimestamp,
    to: dayTimestamp + 86400,
  });
  
  return {
    dailyVolume: data.historicalData[0]?.volumeUST || 0
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.TERRA]: {
      fetch,
      start: '2025-02-11',
    },
  },
};

export default adapter;
