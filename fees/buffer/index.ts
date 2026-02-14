import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "../../adapters/types";
import BigNumber from "bignumber.js";
import { Adapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

const endpoints = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/e66b06ce96d2/bufferfinance/v2.5-arbitrum-mainnet/api",
};

const query = gql`
  query dailyRev($startTimestamp: Int!, $endTimestamp: Int!) {
    defillamaFeeStats(orderBy: timestamp, orderDirection: desc, where:{
      timestamp_gte: $startTimestamp,
      timestamp_lte: $endTimestamp
    }){
      id
      fee
      timestamp
    }
  }
`;

export function _getDayId(timestamp: number): string {
  let dayTimestamp = Math.floor((timestamp - 16 * 3600) / 86400);
  return dayTimestamp.toString();
}

const graphs = (baseUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = _getDayId(timestamp);

      const url = new URL(baseUrls[chain]);
      url.searchParams.append("day", dateId);

      const response = await request(baseUrls[chain], query, { startTimestamp: timestamp - 86400, endTimestamp: timestamp });
      const dailyFee = response.defillamaFeeStats[0]?.fee / 1000000 || 0;

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.toString(),
      };
    };
  };
};

const methodology = {
  Fees: "Trading fees collected from options trading on the Buffer protocol",
  Revenue: "Protocol revenue from trading fees retained by Buffer"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Fees paid by traders on options trading transactions',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Portion of trading fees retained by the Buffer protocol',
  }
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: '2023-01-29',
    },
  },
  version: 1,
  methodology,
  breakdownMethodology,
};

export default adapter;
