import { formatEther } from "ethers";
import { request, gql } from "graphql-request";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cmae5a5bs72to01xmbkb04v80/subgraphs/privex-analytics/1.0.0/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

interface IGraphResponse {
  dailyHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: string;
  }>;
}

const queryBase = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x921dd892d67aed3d492f9ad77b30b60160b53fe1" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

const queryCoti = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0xbf318724218ced9a3ff7cfc642c71a0ca1952b0f" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

const queries = {
  [CHAIN.BASE]: queryBase,
  [CHAIN.COTI]: queryCoti,
}

const fetchFees = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const from = options.fromTimestamp;
  const to = options.toTimestamp;
  const response: IGraphResponse = await request(endpoints[options.chain], queries[options.chain], {
    from: String(from),
    to: String(to),
  });

  const dailyFeesBigInt = response.dailyHistories.reduce((sum, data) => sum + BigInt(data.platformFee), BigInt(0));
  const dailyFees = formatEther(dailyFeesBigInt);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Platform fees collected by PriveX from derivatives trading activities",
  Revenue: "All platform fees collected represent protocol revenue",
  ProtocolRevenue: "All platform fees collected represent protocol revenue",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: "2024-09-08",
      meta: { methodology },
    },
    [CHAIN.COTI]: {
      fetch: fetchFees,
      start: "2025-01-01",
      meta: { methodology },
    },
  },
};

export default adapter;