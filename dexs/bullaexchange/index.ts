import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

const endpoint = "https://api.goldsky.com/api/public/project_clols2c0p7fby2nww199i4pdx/subgraphs/algebra-berachain-mainnet/0.0.3/gn";

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
  
  console.log("🚀 Total Fees USD from algebraDayDatas:", totalFeesUSD);

  if (totalFeesUSD === 0) {
    return { volumeUSD: data.volumeUSD || "0", feesUSD: "0", revenueUSD: "0" };
  }

  let totalRevenue = 0;

  pools.forEach(pool => {
    const poolFees = parseFloat(pool.feesUSD) || 0;
    let communityFee = parseFloat(pool.communityFee) || 0;

    console.log(`🔹 Pool Fees: ${poolFees}, Community Fee (Raw): ${communityFee}`);

    // Correct the scaling of communityFee by dividing by 10000
    communityFee /= 10000;

    console.log(`✅ Community Fee (Scaled): ${communityFee}`);

    const poolRevenue = (poolFees / totalFeesUSD) * totalFeesUSD * communityFee;
    totalRevenue += poolRevenue;
  });

  console.log("✅ Corrected Total Revenue USD:", totalRevenue.toFixed(2));

  return {
    volumeUSD: data.volumeUSD || "0",
    feesUSD: data.feesUSD || "0",
    revenueUSD: totalRevenue.toFixed(2),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: async (timestamp: number) => {
        const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
        const totalVolume = await fetchTotalVolume();
        const { volumeUSD, feesUSD, revenueUSD } = await fetchDailyData(dayTimestamp);

        return {
          totalVolume: parseFloat(totalVolume),
          dailyVolume: parseFloat(volumeUSD),
          dailyFees: parseFloat(feesUSD),
          dailyRevenue: parseFloat(revenueUSD), // Now correctly weighted
          timestamp: dayTimestamp,
        };
      },
      start: async () => 1738800000, // Timestamp for February 6, 2025
    },
  },
};

export default adapter;
