import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

const endpoint =
  "https://api.goldsky.com/api/public/project_cmb20ryy424yb01wy7zwd7xd1/subgraphs/analytics/1.2.3/gn";

// GraphQL query to fetch total volume
const totalVolumeQuery = gql`
  query {
    factories(first: 1) {
      totalVolumeUSD
    }
  }
`;

// GraphQL query to fetch daily volume, total fees, and per-pool fees/community fees
const dailyVolumeFeesQuery = gql`
  query ($date: Int!) {
    algebraDayDatas(where: { date: $date }) {
      volumeUSD
      feesUSD
    }
    pools {
      feesUSD
      communityFee
    }
  }
`;

// Function to fetch total volume
const fetchTotalVolume = async () => {
  const response = await request(endpoint, totalVolumeQuery);
  return response.factories[0]?.totalVolumeUSD || "0";
};

// Function to fetch daily volume, fees, and correctly calculated revenue
const fetchDailyData = async (date: number) => {
  const response = await request(endpoint, dailyVolumeFeesQuery, { date });
  const data = response.algebraDayDatas[0] || {};
  const pools = response.pools || [];

  const totalFeesUSD = parseFloat(data.feesUSD) || 0;

  if (totalFeesUSD === 0) {
    return { volumeUSD: data.volumeUSD || "0", feesUSD: "0", revenueUSD: "0" };
  }

  let totalRevenue = 0;

  pools.forEach((pool) => {
    const poolFees = parseFloat(pool.feesUSD) || 0;
    const communityFee = pool.communityFee
      ? parseFloat(pool.communityFee) / 10000
      : 0;

    const poolRevenue = poolFees * communityFee;

    totalRevenue += poolRevenue;
  });

  return {
    volumeUSD: data.volumeUSD || "0",
    feesUSD: data.feesUSD || "0",
    revenueUSD: totalRevenue.toFixed(2),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: async (timestamp: number) => {
        const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
        const totalVolume = await fetchTotalVolume();
        const { volumeUSD, feesUSD, revenueUSD } = await fetchDailyData(
          dayTimestamp
        );

        return {
          totalVolume: parseFloat(totalVolume),
          dailyVolume: parseFloat(volumeUSD),
          dailyFees: parseFloat(feesUSD),
          dailyRevenue: parseFloat(revenueUSD),
          dailySupplySideRevenue: parseFloat(feesUSD) - parseFloat(revenueUSD),
          timestamp: dayTimestamp,
        };
      },
      start: "2025-02-06",
    },
  },
  methodology: {
    Volume: "Total users swap volume.",
    Fees: "Swap fees paid by users.",
    Revenue: "Protocol and community shared from fees.",
    SupplySideRevenue: "Fees shared to liquidity providers.",
  },
};

export default adapter;
