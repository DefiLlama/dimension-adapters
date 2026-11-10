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
// Arbitrum GraphPayments: https://github.com/graphprotocol/contracts/blob/main/packages/horizon/addresses.json.
const GRAPH_PAYMENTS = '0x7Aae8ae011927BC36Cb4d0d3e81f2E6E30daE06D'
// Horizon query-fee dataService: https://arbiscan.io/tx/0x76b47edac8f315cda2a133d30bfaf6bfbfa2ede84eb437395f43d5bc8df31dc9.
const SUBGRAPH_SERVICE = '0xb2bb92d0de618878e438b55d5846cfecd9301105'
// Arbitrum GRT (L2GraphToken), same source.
const GRT = '0x9623063377AD1B27544C965cCd7342f7EA7e88C7'
// First GraphPaymentCollected on Arbitrum: block 408991647 (2025-12-10T00:39Z).
const horizonStartTS = Math.floor(+new Date('2025-12-10') / 1e3)
const graphPaymentCollectedEvent = 'event GraphPaymentCollected(uint8 indexed paymentType, address indexed payer, address receiver, address indexed dataService, uint256 tokens, uint256 tokensProtocol, uint256 tokensDataService, uint256 tokensDelegationPool, uint256 tokensReceiver, address receiverDestination)'

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

  if (options.chain === CHAIN.ARBITRUM && options.endTimestamp > horizonStartTS) {
    // Horizon totalQueryFees is net of protocol tax, and the subgraph's GraphPayments handler is registered on a 9-arg
    // event signature that never fires, so the burned tax is missing from both fees and totalTaxedQueryFees.
    // Only SubgraphService query fees reach the subgraph totals, hence the dataService filter.
    // Remove this once totalTaxedQueryFees starts moving alongside GraphPaymentCollected.
    const logs = await options.getLogs({ target: GRAPH_PAYMENTS, eventAbi: graphPaymentCollectedEvent });
    let burn = BigInt(0);
    for (const log of logs) {
      if (Number(log.paymentType) === 0 && log.dataService.toLowerCase() === SUBGRAPH_SERVICE) {
        burn += BigInt(log.tokensProtocol);
      }
    }
    if (burn > BigInt(0)) {
      dailyFees.add(GRT, burn);
      dailyRevenue.add(GRT, burn);
    }
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
    Fees: "Total query fees paid by users for accessing subgraph data, including the protocol tax burned by GraphPayments since Graph Horizon",
    Revenue: "Protocol tax on query fees, burned (legacy staking tax, and since Graph Horizon the 1% protocol payment cut burned by GraphPayments)",
    HoldersRevenue: "Protocol tax on query fees, burned (legacy staking tax, and since Graph Horizon the 1% protocol payment cut burned by GraphPayments)",
    SupplySideRevenue: "Combined revenue from indexer rebates, curator fees and delegator rewards"
  },
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2022-11-30', },
    [CHAIN.ETHEREUM]: { start: '2020-12-17', },
  },
};

export default adapter;
