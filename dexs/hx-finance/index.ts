import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

const GRAPH_ENDPOINT = "https://api.goldsky.com/api/public/project_cmay1j7dh90w601r2hjv26a5b/subgraphs/analytics/v1.3.4/gn";

const fetchTotalMetrics = async () => {
  const query = gql`
    query TotalMetrics {
      factories(first: 1) {
        totalVolumeUSD
        totalFeesUSD
        poolCount
      }
    }
  `;

  try {
    const response = await request(GRAPH_ENDPOINT, query);
    return {
      totalVolume: response.factories[0]?.totalVolumeUSD || "0",
      totalFees: response.factories[0]?.totalFeesUSD || "0",
      poolCount: response.factories[0]?.poolCount || 0,
    };
  } catch (error) {
    console.error("Error fetching total metrics:", error);
    return { totalVolume: "0", totalFees: "0", poolCount: 0 };
  }
};

const fetchDailyMetrics = async (timestamp: number) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;

  const dailyQuery = gql`
    query DailyData($date: Int!) {
      algebraDayDatas(where: { date: $date }) {
        volumeUSD
        feesUSD
        tvlUSD
      }
      pools(first: 100) {
        feesUSD
        communityFee
        volumeUSD
      }
    }
  `;

  try {
    const response = await request(GRAPH_ENDPOINT, dailyQuery, { date: dayTimestamp });
    const dayData = response.algebraDayDatas[0] || {};
    const pools = response.pools || [];

    const dailyVolume = parseFloat(dayData.volumeUSD) || 0;
    const dailyFees = parseFloat(dayData.feesUSD) || 0;
    const tvl = parseFloat(dayData.tvlUSD) || 0;

    let protocolRevenue = 0;
    pools.forEach((pool: any) => {
      const poolFees = parseFloat(pool.feesUSD) || 0;
      const communityFeeRate = pool.communityFee ? parseFloat(pool.communityFee) / 10000 : 0.13;
      protocolRevenue += poolFees * communityFeeRate;
    });

    if (protocolRevenue === 0 && dailyFees > 0) {
      protocolRevenue = dailyFees * 0.13;
    }

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: protocolRevenue,
      dailySupplySideRevenue: dailyFees - protocolRevenue,
      tvl,
    };
  } catch (error) {
    console.error("Error fetching daily metrics:", error);
    return {
      dailyVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
      dailySupplySideRevenue: 0,
      tvl: 0,
    };
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: async (timestamp: number) => {
        const [totalMetrics, dailyMetrics] = await Promise.all([
          fetchTotalMetrics(),
          fetchDailyMetrics(timestamp),
        ]);

        return {
          totalVolume: parseFloat(totalMetrics.totalVolume),
          dailyVolume: dailyMetrics.dailyVolume,
          dailyFees: dailyMetrics.dailyFees,
          dailyRevenue: dailyMetrics.dailyRevenue,
          dailySupplySideRevenue: dailyMetrics.dailySupplySideRevenue,
          timestamp: Math.floor(timestamp / 86400) * 86400,
        };
      },
      start: "2025-08-01",
    },
  },
  methodology: {
    Volume: "Total trading volume on HX Finance DEX",
    Fees: "Trading fees collected from swap transactions",
    Revenue: "Protocol revenue from trading fees (13% or pool-specific community fee)",
    SupplySideRevenue: "Fees distributed to liquidity providers (87% or remainder after protocol fee)",
  },
};

export default adapter;