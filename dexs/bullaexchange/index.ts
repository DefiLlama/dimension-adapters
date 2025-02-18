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

// GraphQL query to fetch daily volume and fees
const dailyVolumeFeesQuery = gql`
  query ($date: Int!) {
    algebraDayDatas(where: { date: $date }) {
      volumeUSD
      feesUSD
    }
  }
`;

// Function to fetch total volume
const fetchTotalVolume = async () => {
  const response = await request(endpoint, totalVolumeQuery);
  return response.factories[0]?.totalVolumeUSD || "0";
};

// Function to fetch daily volume and fees
const fetchDailyData = async (date: number) => {
  const response = await request(endpoint, dailyVolumeFeesQuery, { date });
  const data = response.algebraDayDatas[0] || {};
  return {
    volumeUSD: data.volumeUSD || "0",
    feesUSD: data.feesUSD || "0",
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: async (timestamp: number) => {
        const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
        const totalVolume = await fetchTotalVolume();
        const { volumeUSD, feesUSD } = await fetchDailyData(dayTimestamp);
        
        // Calculate revenue as 25% of fees
        const dailyRevenue = parseFloat(feesUSD) * 0.25;

        return {
          totalVolume: parseFloat(totalVolume),
          dailyVolume: parseFloat(volumeUSD),
          dailyFees: parseFloat(feesUSD),
          dailyRevenue, // Add calculated revenue
          timestamp: dayTimestamp,
        };
      },
      start: async () => 1738800000, // Timestamp for February 6, 2025
    },
  },
};

export default adapter;

