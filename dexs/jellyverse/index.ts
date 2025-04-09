import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

const endpoint = "https://graph.jellyverse.org/";

function getStartOfDayTimestamp(timestamp: number): number {
  const date = new Date(timestamp * 1000);
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

// Helper function to format date for logging
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().split('T')[0];
}

const v2Graphs = () => {
  return async (timestamp: number): Promise<{ dailyVolume: string; dailyFees: string }> => {
    try {
      // Validate and normalize timestamp
      let endTimestamp = timestamp;
      if (!endTimestamp || isNaN(endTimestamp)) {
        endTimestamp = Math.floor(Date.now() / 1000);
      }
      
      // Get start of day for the requested timestamp
      const requestedDayTimestamp = getStartOfDayTimestamp(endTimestamp);
      
      // Get the previous day's timestamp
      const previousDayTimestamp = requestedDayTimestamp - 86400; // 24 hours in seconds
      
      // Fetch only the active pools with volume in a more efficient query
      const volumeQuery = gql`
        query {
          pools(first: 100, orderBy: totalSwapVolume, orderDirection: desc) {
            id
            symbol
            snapshots(
              first: 2,
              where: {
                timestamp_in: [${requestedDayTimestamp}, ${previousDayTimestamp}]
              },
              orderBy: timestamp,
              orderDirection: desc
            ) {
              timestamp
              swapVolume
              swapFees
            }
          }
        }
      `;
      
      const volumeRes = await request(endpoint, volumeQuery);
      
      if (!volumeRes.pools || volumeRes.pools.length === 0) {
        return { dailyVolume: "0", dailyFees: "0" };
      }
      
      // Calculate volume and fees
      let totalVolume = 0;
      let totalFees = 0;
      
      // Process each pool
      volumeRes.pools.forEach((pool: any) => {
        if (pool.snapshots && pool.snapshots.length === 2) {
          // Make sure we have both days
          const requestedDaySnapshot = pool.snapshots.find((s: any) => Number(s.timestamp) === requestedDayTimestamp);
          const previousDaySnapshot = pool.snapshots.find((s: any) => Number(s.timestamp) === previousDayTimestamp);
          
          if (requestedDaySnapshot && previousDaySnapshot) {
            const requestedDayVolume = Number(requestedDaySnapshot.swapVolume);
            const previousDayVolume = Number(previousDaySnapshot.swapVolume);
            const volumeDiff = requestedDayVolume - previousDayVolume;
            
            const requestedDayFees = Number(requestedDaySnapshot.swapFees);
            const previousDayFees = Number(previousDaySnapshot.swapFees);
            const feesDiff = requestedDayFees - previousDayFees;
            
            if (volumeDiff > 0) {
              totalVolume += volumeDiff;
              totalFees += (feesDiff > 0 ? feesDiff : 0);
            }
          }
        }
      });
      
      // Return zero if we have no valid data
      if (totalVolume <= 0 || totalFees < 0 || isNaN(totalVolume) || isNaN(totalFees)) {
        return { dailyVolume: "0", dailyFees: "0" };
      }
      
      return {
        dailyVolume: totalVolume.toString(),
        dailyFees: totalFees.toString(),
      };
    } catch (error) {
      // If any error occurs, return zero values
      return { dailyVolume: "0", dailyFees: "0" };
    }
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SEI]: {
      fetch: v2Graphs(),
      start: 1689811200,
    },
  },
};

export default adapter;