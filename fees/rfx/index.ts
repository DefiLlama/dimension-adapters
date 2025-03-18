import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ZKSYNC]: "https://api.studio.thegraph.com/query/62681/rfxs-master/version/latest",
};

const timestampsQuery = gql`
  {
    revenueInfos(where: { period: "1d" }) {
      id
      timestamp
    }
  }
`;

const feeQuery = gql`
  query get_fees($period: String!, $id: String!) {
    revenueInfos(where: { period: $period, id: $id }) {
      totalFeeUsd
      cumulativeTotalFeeUsd
    }
  }
`;

interface ITimestampsResponse {
  revenueInfos: Array<{
    id: string;
    timestamp: number;
  }>;
}

interface IGraphFeesResponse {
  revenueInfos: Array<{
    totalFeeUsd: string;
    cumulativeTotalFeeUsd: string;
  }>;
}

const fetchFees = async (
  rawTimestamp: number , 
  _block: any,
  _options: FetchOptions
): Promise<FetchResultFees> => {
  const timestamp = rawTimestamp ? Number(rawTimestamp) : undefined;

  const timestampsData: ITimestampsResponse = await request(endpoints[CHAIN.ZKSYNC], timestampsQuery);
  let availableTimestamps = timestampsData.revenueInfos.map((entry) => entry.timestamp);

  if (availableTimestamps.length === 0) {
    throw new Error("❌ No timestamps found in the subgraph.");
  }

  availableTimestamps.sort((a, b) => a - b);

  let chosenTimestamp;

  if (timestamp) {
    chosenTimestamp = availableTimestamps.reduce((prev, curr) =>
      Math.abs(curr - timestamp) < Math.abs(prev - timestamp) ? curr : prev
    );
  } else {
    chosenTimestamp = availableTimestamps[availableTimestamps.length - 1];
  }

  console.log(`🔍 Using closest available timestamp: ${chosenTimestamp}`);

  const dailyData: IGraphFeesResponse = await request(endpoints[CHAIN.ZKSYNC], feeQuery, {
    id: chosenTimestamp.toString(),
    period: "1d",
  });

  let dailyFees = 0;
  let totalFees = 0;

  if (dailyData.revenueInfos.length === 1) {
    dailyFees = Number(dailyData.revenueInfos[0].totalFeeUsd) * 1e-30;
    totalFees = Number(dailyData.revenueInfos[0].cumulativeTotalFeeUsd) * 1e-30;
  }

  return {
    timestamp: chosenTimestamp,
    dailyFees: String(dailyFees),
    totalFees: String(totalFees),
    dailyRevenue: String(dailyFees),
    dailyProtocolRevenue: "0",
    dailyHoldersRevenue: "0",
    dailySupplySideRevenue: "0",
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ZKSYNC]: {
      start: 1733356800,
      fetch: fetchFees,
    },
  },
  version: 2,
};

export default adapter;


