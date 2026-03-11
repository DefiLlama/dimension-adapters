import request from "graphql-request";
import { Adapter, FetchResultFees, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ZKSYNC]: "https://api.studio.thegraph.com/query/62681/rfxs-master/version/latest",
};

interface IGraphFeesResponse {
  revenueInfos: Array<{
    totalFeeUsd: string;
    cumulativeTotalFeeUsd: string;
  }>;
}

const fetchFees = async (
_:any, _1:any, options: FetchOptions
): Promise<FetchResultFees> => {
  const dailyData: IGraphFeesResponse = await request(endpoints[CHAIN.ZKSYNC], `
  query get_fees {
    revenueInfos(where: { period: "1d", timestamp: ${options.startOfDay} }) {
      totalFeeUsd
      cumulativeTotalFeeUsd
    }
  }
`);

  if (dailyData.revenueInfos.length !== 1) {
    throw new Error("Unexpected number of results");
  }
  let dailyFees = Number(dailyData.revenueInfos[0].totalFeeUsd) * 1e-30;

  return {
    timestamp: options.startOfDay,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ZKSYNC]: {
      start: '2024-12-05',
      fetch: fetchFees,
    },
  },
  version: 1,
};

export default adapter;


