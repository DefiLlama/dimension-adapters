import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getHydrationBlock } from "../../helpers/getBlock";
import { request } from "graphql-request";


const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const fromBlock = await getHydrationBlock(fromTimestamp)
  const toBlock = await getHydrationBlock(toTimestamp)

  // Fetch fees data from GraphQL endpoint
  const feesQuery = `query MyQuery { platformTotalVolumesByPeriod( filter: {startBlockNumber: ${fromBlock}, endBlockNumber: ${toBlock}} ) { nodes { totalVolNorm} } }
    `;

  const feesResponse = await request("https://galacticcouncil.squids.live/hydration-pools:whale-prod/api/graphql", feesQuery);

  if (feesResponse.platformTotalVolumesByPeriod?.nodes?.length == 0)
    throw new Error("No fees data found for the given block range")

  const node = feesResponse.platformTotalVolumesByPeriod.nodes[0];


  return {
    dailyVolume: node.totalVolNorm,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      start: '2023-08-22',
    },
  },
};

export default adapter;
