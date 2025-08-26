import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint_0_8_0 = "https://api.studio.thegraph.com/query/62472/perpetuals-analytics_base/version/latest";
const endpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-base-analytics-083/latest/gn";
const endpoint_blast =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-blast-analytics-083/latest/gn";
const endpoint_mantle =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-mantle-analytics-083/latest/gn";
const endpoint_arbitrum =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-arbitrum-analytics-083/latest/gn";

interface IGraphResponse {
  dailyHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: string;
  }>;
}

function getQuery(account) {
  return `
    query stats($from: String!, $to: String!) {
      dailyHistories(
        where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "${account}" }
      ) {
        timestamp
        platformFee
        accountSource
        tradeVolume
      }
    }
  `;
}

const fetch = async ({ endTimestamp, startTimestamp, chain }: FetchOptions) => {
  let dailyFees = new BigNumber(0);

  const { dailyHistories }: IGraphResponse = await request(config[chain].endpoint, getQuery(config[chain].account), {
    from: String(startTimestamp),
    to: String(endTimestamp),
  });
  dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18));
  const _dailyFees = dailyFees.toString()
  return {
    dailyFees: _dailyFees,

    dailyUserFees: _dailyFees,
    dailyRevenue: _dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: _dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const config: any = {
  [CHAIN.BLAST]: { endpoint: endpoint_blast, account: '0x083267D20Dbe6C2b0A83Bd0E601dC2299eD99015' },
  [CHAIN.MANTLE]: { endpoint: endpoint_mantle, account: '0xECbd0788bB5a72f9dFDAc1FFeAAF9B7c2B26E456' },
  [CHAIN.ARBITRUM]: { endpoint: endpoint_arbitrum, account: '0x141269E29a770644C34e05B127AB621511f20109' },
  [CHAIN.BASE]: { endpoint: endpoint_0_8_0, account: '0x724796d2e9143920B1b58651B04e1Ed201b8cC98' },
}
const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: '2023-11-01', },
    [CHAIN.BLAST]: { start: '2023-11-01', },
    [CHAIN.MANTLE]: { start: '2023-11-01', },
    [CHAIN.ARBITRUM]: { start: '2023-11-01', },
  },
};
export default adapter;
