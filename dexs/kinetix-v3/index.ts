import { gql, request } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  // [CHAIN.KAVA]: "https://the-graph.kava.io/subgraphs/name/kinetixfi/v3-subgraph", // subgraph stale since April 2024, protocol winding down
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/55804/kinetixfi-base-v3/version/latest",
};

const fetch = (endpoint: string) => {
  return async (timestamp: number) => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const dayId = Math.floor(dayTimestamp / 86400);

    const graphQuery = gql`{
      uniswapDayData(id: "${dayId}") {
        date
        volumeUSD
        feesUSD
      }
    }`;

    const response = await request(endpoint, graphQuery);
    const dayData = response.uniswapDayData;

    return {
      timestamp: dayTimestamp,
      dailyVolume: dayData?.volumeUSD || "0",
      dailyFees: dayData?.feesUSD || "0",
    };
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    // [CHAIN.KAVA]: {
    //   fetch: fetch(endpoints[CHAIN.KAVA]),
    //   start: "2023-08-15",
    // },
    [CHAIN.BASE]: {
      fetch: fetch(endpoints[CHAIN.BASE]),
      start: "2024-05-19", // When subgraph started indexing
    },
  },
  methodology: {
    Fees: "Each pool charge between 0.01% to 1% fee",
    UserFees: "Users pay between 0.01% to 1% fee",
    Revenue: "0 to 1/4 of the fee goes to treasury",
    HoldersRevenue: "None",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue:
      "Liquidity providers get most of the fees of all trades in their pools",
  },
};

export default adapter;
