import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniswapV3Fees } from "../../helpers/getUniV3Fees";

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

  // Adding a 10-second timeout to prevent the adapter from hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await request(SUBGRAPH_URL, query, 
      { id: dayId.toString() }, 
      { signal: controller.signal }
    );
    
    return {
      timestamp: timestamp,
      dailyVolume: response.uniswapDayData?.volumeUSD || "0",
    };
  } catch (error) {
    console.error("Error fetching volume from Shido Subgraph:", error);
    return { timestamp, dailyVolume: "0" };
  } finally {
    clearTimeout(timeoutId);
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SHIDO]: {
      fetch,
      start: "2024-09-18", // Aligned to UTC midnight for data accuracy
    },
  },
};

export default adapter;
