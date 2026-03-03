import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dateId = _getDayId(options.startOfDay);

  const url = new URL(endpoints[options.chain]);
  url.searchParams.append("day", dateId);

  const response = await request(url.toString(), query, { startTimestamp: options.startOfDay - 86400, endTimestamp: options.startOfDay });
  const dailyFee = response.defillamaFeeStats[0]?.fee / 1000000 || 0;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(dailyFee), METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
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
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2023-01-29',
  methodology,
  breakdownMethodology,
};

export default adapter;
