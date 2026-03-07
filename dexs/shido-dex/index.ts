import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";

const SUBGRAPH_URL = "https://prod-v2-graph-node.shidoscan.com/subgraphs/name/shido/mainnet";

const fetch = async (options: FetchOptions) => {
  // DefiLlama passes the Unix timestamp for the start of the day
  // Subgraphs index daily data by dividing the timestamp by 86400 (seconds in a day)
  const dayId = Math.floor(options.startOfDay / 86400);

  const query = gql`
    query getVolume($id: Int!) {
      uniswapDayData(id: $id) {
        volumeUSD
      }
    }
  `;

  try {
    const response = await request(SUBGRAPH_URL, query, { id: dayId });
    
    // Extract the volume, defaulting to 0 if no trades happened that day
    const dailyVolume = response?.uniswapDayData?.volumeUSD || "0";

    return {
      dailyVolume: dailyVolume,
      timestamp: options.startOfDay,
    };
  } catch (error) {
    console.error("Subgraph query failed:", error);
    throw error;
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    shido: {
      fetch,
      start: 1726608494, // Sep 18, 2024
    },
  },
};

export default adapter;
