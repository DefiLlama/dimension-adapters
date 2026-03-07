import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

const SUBGRAPH_URL = "https://prod-v2-graph-node.shidoscan.com/subgraphs/name/shido/mainnet";

const fetch = async (timestamp: number) => {
  const dayId = Math.floor(timestamp / 86400);
  const query = gql`
    query getVolume($id: ID!) {
      uniswapDayData(id: $id) {
        volumeUSD
      }
    }
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    // Fixed: Using the options-object format to properly pass the AbortSignal
    const response = await request({
      url: SUBGRAPH_URL,
      document: query,
      variables: { id: dayId.toString() },
      signal: controller.signal
    });
    
    return {
      timestamp: timestamp,
      dailyVolume: response.uniswapDayData?.volumeUSD || "0",
    };
  } catch (error: any) {
    // Fixed: Throwing errors instead of returning 0 to ensure data integrity
    if (error.name === 'AbortError') {
      throw new Error(`Timeout: Shido Subgraph took too long at ${timestamp}`);
    }
    throw error; 
  } finally {
    clearTimeout(timeoutId);
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SHIDO]: {
      fetch,
      start: "2024-09-18",
    },
  },
};

export default adapter;
