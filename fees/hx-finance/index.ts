import { gql, request } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ANALYTICS_ENDPOINT = "https://api.goldsky.com/api/public/project_cmay1j7dh90w601r2hjv26a5b/subgraphs/analytics/v1.3.4/gn";

const PROTOCOL_FEE_RATIO = 0.13;
const LP_FEE_RATIO = 0.87;

const fetchDailyFees = async ({ startOfDay }: FetchOptions) => {
  const feesQuery = gql`
    query DailyMetrics($timestamp: Int!) {
      algebraDayDatas(where: { date: $timestamp }) {
        feesUSD
        volumeUSD
        tvlUSD
      }
    }
  `;

  const response = await request(ANALYTICS_ENDPOINT, feesQuery, {
    timestamp: startOfDay,
  });

  if (!response.algebraDayDatas || response.algebraDayDatas.length === 0) {
    return {
      dailyFees: 0,
      dailyUserFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyHoldersRevenue: 0,
    };
  }

  const dayData = response.algebraDayDatas[0];
  const totalFees = parseFloat(dayData.feesUSD) || 0;
  const protocolRevenue = totalFees * PROTOCOL_FEE_RATIO;
  const lpRevenue = totalFees * LP_FEE_RATIO;

  return {
    dailyFees: totalFees,
    dailyUserFees: totalFees,
    dailyRevenue: protocolRevenue,
    dailyProtocolRevenue: protocolRevenue,
    dailySupplySideRevenue: lpRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchDailyFees,
      start: "2025-08-01",
    },
  },
  methodology: {
    Fees: "Trading fees collected from swaps on HX Finance DEX",
    UserFees: "Total fees paid by traders for swap transactions",
    Revenue: "Protocol's share of trading fees",
    ProtocolRevenue: "13% of trading fees allocated to protocol treasury",
    SupplySideRevenue: "87% of trading fees distributed to liquidity providers",
  },
};

export default adapter;