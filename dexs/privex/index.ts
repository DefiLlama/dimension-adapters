import { formatEther } from "ethers";
import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter, FetchResultVolume} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IGraphResponse {
  dailyHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: string;
  }>;
}

const chainConfig = {
  // [CHAIN.BASE]: {
  //   start: '2024-09-08', // October 8, 2024
  //   accountSource: '0x921dd892d67aed3d492f9ad77b30b60160b53fe1',
  //   endpoint: 'https://api.goldsky.com/api/public/project_cmae5a5bs72to01xmbkb04v80/subgraphs/privex-analytics/1.0.0/gn',
  // },
  [CHAIN.COTI]: {
    start: '2025-01-01', // January 1, 2025
    accountSource: '0xbf318724218ced9a3ff7cfc642c71a0ca1952b0f',
    endpoint: 'https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics',
  },
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = ` 
    query stats {
      dailyHistories(
        where: { timestamp_gte: "${options.fromTimestamp}", timestamp_lte: "${options.toTimestamp}", accountSource: "${chainConfig[options.chain].accountSource}" }
      ) {
        timestamp
        platformFee
        accountSource
        tradeVolume
      }
    }
  `
  const response: IGraphResponse = await request(chainConfig[options.chain].endpoint, query);

  const dailyVolumeBigInt = response.dailyHistories.reduce((sum, data) => sum + BigInt(data.tradeVolume), BigInt(0));
  const dailyFeesBigInt = response.dailyHistories.reduce((sum, data) => sum + BigInt(data.platformFee), BigInt(0));
  const dailyFees = formatEther(dailyFeesBigInt);
  const dailyVolume = formatEther(dailyVolumeBigInt * 2n);

  return { 
    dailyVolume,
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
  fetch,
  methodology,
  adapter: chainConfig
};

export default adapter;