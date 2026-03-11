import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getHydrationBlock } from "../helpers/getBlock";
import { request } from "graphql-request";


const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const fromBlock = await getHydrationBlock(fromTimestamp)
  const toBlock = await getHydrationBlock(toTimestamp)

  // Fetch fees data from GraphQL endpoint
  let dailyFees = 0;
  const feesQuery = `query MyQuery { platformTotalVolumesByPeriod( filter: {startBlockNumber: ${fromBlock}, endBlockNumber: ${toBlock}} ) { nodes { omnipoolFeeVolNorm stableswapFeeVolNorm xykpoolFeeVolNorm } } }
    `;

  const feesResponse = await request("https://galacticcouncil.squids.live/hydration-pools:whale-prod/api/graphql", feesQuery);

  if (feesResponse.platformTotalVolumesByPeriod?.nodes?.length == 0)
    throw new Error("No fees data found for the given block range")

  const node = feesResponse.platformTotalVolumesByPeriod.nodes[0];

  // Sum all fee volumes to get total USD fees
  dailyFees = (
    parseFloat(node.omnipoolFeeVolNorm || '0') +
    parseFloat(node.stableswapFeeVolNorm || '0') +
    parseFloat(node.xykpoolFeeVolNorm || '0')
  );

  const dailyRevenue = node.omnipoolFeeVolNorm / 5
  const dailySupplySideRevenue = (+node.omnipoolFeeVolNorm - dailyRevenue) + +node.stableswapFeeVolNorm + +node.xykpoolFeeVolNorm

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue / 2,
    dailyHoldersRevenue: dailyRevenue / 2,
  };
};


// https://docs.hydration.net/products/trading/fees#protocol-fee
const methodology = {
  Fees: 'All fees paid by users for swaps on Hydration.',
  Revenue: 'Approx 1/5th of fees is distributed to the protocol',
  SupplySideRevenue: 'All fees paid to liquidity providers for stableswap and xykpool. For omnipool, approx 80%. of the fees',
  ProtocolRevenue: 'Approx 1/10th of fees is distributed to the protocol treasury',
  HoldersRevenue: 'Paid in H2O tokens, are burnt',
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      start: '2023-08-22',
    },
  },
  methodology,
};

export default adapter;
