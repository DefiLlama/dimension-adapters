import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import * as sdk from "@defillama/sdk";

const endpoint =
  "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/6unAN9LodW2k1NC8JZh12NuddZj48XTTq852GuPbsQmr";

const dailyQuery = gql`
  query daily($dayId: ID!) {
    protocolDayData(id: $dayId) {
      volumeUSD
      txCount
    }
  }
`;

const fetch = async (options: FetchOptions) => {
  const dayId = Math.floor(options.startOfDay / 86400).toString();
  const url = sdk.graph.modifyEndpoint(endpoint);

  const dailyRes = await request(url, dailyQuery, { dayId });

  if (!dailyRes?.protocolDayData) {
    throw new Error(`No data for day ${dayId}`);
  }

  return {
    dailyVolume: dailyRes.protocolDayData.volumeUSD,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-03-14",
    },
  },
};

export default adapter;
