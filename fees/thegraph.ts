/**
 * The Graph Protocol Fees & Revenue Adapter
 * -----------------------------------------
 * Fetches fees and revenue data from The Graph protocol on Arbitrum using the subgraph.
 * 
 * Fee Structure:(source: https://github.com/graphprotocol/graph-network-subgraph/blob/master/schema.graphql)
 * - Query Fees: Total fees generated in the network from subgraph queries
 * - Protocol Revenue: Protocol tax applied to query fees (1% query fees, 0.5% delegation tax, 1% curation tax)
 * - Supply Side Revenue:
 *   • Indexer Rebates: Query fees claimed by indexers after service
 *   • Delegator Rebates: Query fees claimed by delegators
 *   • Curator Fees: Query fees paid to curators for signal/curation
 */

import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { graph } from "@defillama/sdk";

const ENDPOINT = graph.modifyEndpoint('DZz4kDTdmzWLWsV373w2bSmoar3umKKH9y82SUKr5qmp');

interface PaymentSource {
  id: string;
  totalCuratorQueryFees: string;
  totalDelegatorQueryFeeRebates: string;
  totalIndexerQueryFeeRebates: string;
  totalQueryFees: string;
  totalTaxedQueryFees: string;
}

interface GraphQLResponse {
  yesterday: PaymentSource[];
  today: PaymentSource[];
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  const totalFees = options.createBalances();
  const totalRevenue = options.createBalances();
  const totalSupplySideRevenue = options.createBalances();

  const [todaysBlock, yesterdaysBlock] = await Promise.all([
    getBlock(options.endTimestamp, options.chain, {}),
    getBlock(options.startTimestamp, options.chain, {}),
  ]);

  const data: GraphQLResponse = await request(ENDPOINT, gql`{
    yesterday: paymentSources(block: {number: ${yesterdaysBlock}}) {
      id
      totalCuratorQueryFees
      totalDelegatorQueryFeeRebates
      totalIndexerQueryFeeRebates
      totalQueryFees
      totalTaxedQueryFees
    }
    today: paymentSources(block: {number: ${todaysBlock}}) {
      id
      totalCuratorQueryFees
      totalDelegatorQueryFeeRebates
      totalIndexerQueryFeeRebates
      totalQueryFees
      totalTaxedQueryFees
    }
  }`);

  const yesterdayMap = new Map(data.yesterday.map(source => [source.id, source]));
  const todayMap = new Map(data.today.map(source => [source.id, source]));

  let totalQueryFeesDiff = BigInt(0);
  let totalProtocolTaxDiff = BigInt(0);
  let totalCuratorFeesDiff = BigInt(0);
  let totalDelegatorRewardsDiff = BigInt(0);
  let totalIndexerRebatesDiff = BigInt(0);

  for (const [id, todaySource] of todayMap) {
    const yesterdaySource = yesterdayMap.get(id);
    if (!yesterdaySource) continue;

    totalQueryFeesDiff += BigInt(todaySource.totalQueryFees) - BigInt(yesterdaySource.totalQueryFees);
    totalProtocolTaxDiff += BigInt(todaySource.totalTaxedQueryFees) - BigInt(yesterdaySource.totalTaxedQueryFees);
    totalCuratorFeesDiff += BigInt(todaySource.totalCuratorQueryFees) - BigInt(yesterdaySource.totalCuratorQueryFees);
    totalDelegatorRewardsDiff += BigInt(todaySource.totalDelegatorQueryFeeRebates) - BigInt(yesterdaySource.totalDelegatorQueryFeeRebates);
    totalIndexerRebatesDiff += BigInt(todaySource.totalIndexerQueryFeeRebates) - BigInt(yesterdaySource.totalIndexerQueryFeeRebates);
  }

  if (totalQueryFeesDiff > 0) {
    dailyFees.addCGToken("the-graph", totalQueryFeesDiff / BigInt(1e18));
  }

  // daily revenue is protocol tax (burned)
  if (totalProtocolTaxDiff > 0) {
    dailyRevenue.addCGToken("the-graph", totalProtocolTaxDiff / BigInt(1e18));
  }

  // Supply side revenue (indexer rebates + delegator rewards + curator fees)
  const totalSupplySideDiff = totalIndexerRebatesDiff + totalDelegatorRewardsDiff + totalCuratorFeesDiff;
  if (totalSupplySideDiff > 0) {
    dailySupplySideRevenue.addCGToken("the-graph", totalSupplySideDiff / BigInt(1e18));
  }

  for (const [id, todaySource] of todayMap) {
    totalFees.addCGToken("the-graph", BigInt(todaySource.totalQueryFees) / BigInt(1e18));

    totalRevenue.addCGToken("the-graph", BigInt(todaySource.totalTaxedQueryFees) / BigInt(1e18));

    const totalSupplySide = BigInt(todaySource.totalIndexerQueryFeeRebates) + 
                           BigInt(todaySource.totalDelegatorQueryFeeRebates) +
                           BigInt(todaySource.totalCuratorQueryFees);
    totalSupplySideRevenue.addCGToken("the-graph", totalSupplySide / BigInt(1e18));
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
    totalFees,
    totalUserFees: totalFees,
    totalRevenue,
    totalHoldersRevenue: totalRevenue,
    totalSupplySideRevenue
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: '2022-11-30',
      meta: {
        methodology: {
          fees: "Total query fees paid by users for accessing subgraph data",
          revenue: "Combined revenue from protocol tax (burned fees)",
          supplySideRevenue: "Combined revenue from indexer rebates, curator fees and delegator rewards"
        },
      },
    },
  },
};

export default adapter;
