/**
 * The Graph Protocol Fees & Revenue Adapter
 * -----------------------------------------
 * Fetches fees and revenue data from The Graph protocol on Arbitrum and Ethereum using their respective subgraphs.
 * 
 * Fee Structure:(source: https://github.com/graphprotocol/graph-network-subgraph/blob/master/schema.graphql)
 * - Query Fees: Total fees generated in the network from subgraph queries
 * - Protocol Revenue: Protocol tax applied to query fees (1% query fees, 0.5% delegation tax, 1% curation tax)
 * - Supply Side Revenue:
 *   • Indexer Rebates: Query fees claimed by indexers after service
 *   • Delegator Rebates: Query fees claimed by delegators
 *   • Curator Fees: Query fees paid to curators for signal/curation
 */

import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";

interface GraphNetwork {
  id: string;
  totalQueryFees: number;
  totalCuratorQueryFees: number;
  totalDelegatorQueryFeeRebates: number;
  totalIndexerQueryFeeRebates: number;
  totalTaxedQueryFees: number;
}

interface GraphQLResponse {
  yesterday: GraphNetwork[];
  today: GraphNetwork[];
}

const endpoints: any = {
  [CHAIN.ARBITRUM]: 'DZz4kDTdmzWLWsV373w2bSmoar3umKKH9y82SUKr5qmp',
  [CHAIN.ETHEREUM]: '9Co7EQe5PgW3ugCUJrJgRv4u9zdEuDJf8NvMWftNsBH8',
}

const arbitrumMigrationTS = Math.floor(+new Date('2022-11-30') / 1e3)

const fetch = async (options: FetchOptions) => {

  if (options.chain === CHAIN.ETHEREUM) {
    if (options.startTimestamp > arbitrumMigrationTS) return {}
  } else if (options.chain === CHAIN.ARBITRUM) {
    if (options.startTimestamp < arbitrumMigrationTS) return {}
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [todaysBlock, yesterdaysBlock] = await Promise.all([
    getBlock(options.endTimestamp, options.chain, {}),
    getBlock(options.startTimestamp, options.chain, {}),
  ]);

  const data: GraphQLResponse = await sdk.graph.request(endpoints[options.chain], `{
    yesterday: graphNetworks(block: {number: ${yesterdaysBlock}}) {
      id
      totalQueryFees
      totalCuratorQueryFees
      totalDelegatorQueryFeeRebates
      totalIndexerQueryFeeRebates
      totalTaxedQueryFees
    }
    today: graphNetworks(block: {number: ${todaysBlock}}) {
      id
      totalQueryFees
      totalCuratorQueryFees
      totalDelegatorQueryFeeRebates
      totalIndexerQueryFeeRebates
      totalTaxedQueryFees
    }
  }`);

  const yesterday = data.yesterday[0];
  const today = data.today[0];

  if (!yesterday || !today) return {};

  // Total fees (from queries)
  const totalQueryFeesDiff = today.totalQueryFees - +yesterday.totalQueryFees;
  // Protocol revenue (from taxed fees)
  const totalProtocolTaxDiff = today.totalTaxedQueryFees - yesterday.totalTaxedQueryFees;
  // Supply side components
  const totalCuratorFeesDiff = today.totalCuratorQueryFees - yesterday.totalCuratorQueryFees;
  const totalDelegatorRewardsDiff = today.totalDelegatorQueryFeeRebates - yesterday.totalDelegatorQueryFeeRebates;
  const totalIndexerRebatesDiff = today.totalIndexerQueryFeeRebates - yesterday.totalIndexerQueryFeeRebates;

  if (totalQueryFeesDiff > 0) {
    dailyFees.addCGToken("the-graph", totalQueryFeesDiff / 1e18);
  }

  if (totalProtocolTaxDiff > 0) {
    dailyRevenue.addCGToken("the-graph", totalProtocolTaxDiff / 1e18);
  }

  const totalSupplySideDiff = totalIndexerRebatesDiff + totalDelegatorRewardsDiff + totalCuratorFeesDiff;
  if (totalSupplySideDiff > 0) {
    dailySupplySideRevenue.addCGToken("the-graph", totalSupplySideDiff / 1e18);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "Total query fees paid by users for accessing subgraph data",
    Revenue: "Combined revenue from protocol tax (burned fees)",
    HoldersRevenue: "Combined revenue from protocol tax (burned fees)",
    SupplySideRevenue: "Combined revenue from indexer rebates, curator fees and delegator rewards"
  },
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2022-11-30', },
    [CHAIN.ETHEREUM]: { start: '2020-12-17', },
  },
};

export default adapter;
