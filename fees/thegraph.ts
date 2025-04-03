/**
 * The Graph Protocol Fees & Revenue Adapter
 * -----------------------------------------
 * Fetches fees and revenue data from The Graph protocol on Arbitrum and Ethereum using their respective subgraphs.
 * 
 * Arbitrum Fee Structure:(source: https://github.com/graphprotocol/graph-network-subgraph/blob/master/schema.graphql)
 * Ethereum Fee Structure:(source: https://github.com/graphprotocol/graph-network-subgraph/blob/master/schema.graphql)
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

const ARBITRUM_ENDPOINT = graph.modifyEndpoint('DZz4kDTdmzWLWsV373w2bSmoar3umKKH9y82SUKr5qmp');
const ETHEREUM_ENDPOINT = graph.modifyEndpoint('9Co7EQe5PgW3ugCUJrJgRv4u9zdEuDJf8NvMWftNsBH8');

interface PaymentSource {
  id: string;
  totalCuratorQueryFees: string;
  totalDelegatorQueryFeeRebates: string;
  totalIndexerQueryFeeRebates: string;
  totalQueryFees: string;
  totalTaxedQueryFees: string;
}

interface GraphNetwork {
  id: string;
  totalQueryFees: string;
  totalCuratorQueryFees: string;
  totalDelegatorQueryFeeRebates: string;
  totalIndexerQueryFeeRebates: string;
  totalTaxedQueryFees: string;
}

interface ArbitrumGraphQLResponse {
  yesterday: PaymentSource[];
  today: PaymentSource[];
}

interface EthereumGraphQLResponse {
  yesterday: GraphNetwork[];
  today: GraphNetwork[];
}

const fetchArbitrum = async (options: FetchOptions) => {
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

  const data: ArbitrumGraphQLResponse = await request(ARBITRUM_ENDPOINT, gql`{
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

  if (totalProtocolTaxDiff > 0) {
    dailyRevenue.addCGToken("the-graph", totalProtocolTaxDiff / BigInt(1e18));
  }

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

const fetchEthereum = async (options: FetchOptions) => {
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

  const data: EthereumGraphQLResponse = await request(ETHEREUM_ENDPOINT, gql`{
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
  const totalQueryFeesDiff = BigInt(today.totalQueryFees) - BigInt(yesterday.totalQueryFees);
  // Protocol revenue (from taxed fees)
  const totalProtocolTaxDiff = BigInt(today.totalTaxedQueryFees) - BigInt(yesterday.totalTaxedQueryFees);
  // Supply side components
  const totalCuratorFeesDiff = BigInt(today.totalCuratorQueryFees) - BigInt(yesterday.totalCuratorQueryFees);
  const totalDelegatorRewardsDiff = BigInt(today.totalDelegatorQueryFeeRebates) - BigInt(yesterday.totalDelegatorQueryFeeRebates);
  const totalIndexerRebatesDiff = BigInt(today.totalIndexerQueryFeeRebates) - BigInt(yesterday.totalIndexerQueryFeeRebates);

  if (totalQueryFeesDiff > 0) {
    dailyFees.addCGToken("the-graph", totalQueryFeesDiff / BigInt(1e18));
  }

  if (totalProtocolTaxDiff > 0) {
    dailyRevenue.addCGToken("the-graph", totalProtocolTaxDiff / BigInt(1e18));
  }

  const totalSupplySideDiff = totalIndexerRebatesDiff + totalDelegatorRewardsDiff + totalCuratorFeesDiff;
  if (totalSupplySideDiff > 0) {
    dailySupplySideRevenue.addCGToken("the-graph", totalSupplySideDiff / BigInt(1e18));
  }

  totalFees.addCGToken("the-graph", BigInt(today.totalQueryFees) / BigInt(1e18));
  totalRevenue.addCGToken("the-graph", BigInt(today.totalTaxedQueryFees) / BigInt(1e18));

  const totalSupplySide = BigInt(today.totalIndexerQueryFeeRebates) + 
                         BigInt(today.totalDelegatorQueryFeeRebates) +
                         BigInt(today.totalCuratorQueryFees);
  totalSupplySideRevenue.addCGToken("the-graph", totalSupplySide / BigInt(1e18));

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
      fetch: fetchArbitrum as any,
      start: '2022-11-30',
      meta: {
        methodology: {
          fees: "Total query fees paid by users for accessing subgraph data",
          revenue: "Combined revenue from protocol tax (burned fees)",
          supplySideRevenue: "Combined revenue from indexer rebates, curator fees and delegator rewards"
        },
      },
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum as any,
      start: '2020-12-17',
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
