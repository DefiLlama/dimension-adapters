/**
 * The Graph Protocol Fees & Revenue Adapter
 * abi source: https://github.com/graphprotocol/contracts/tree/main/packages/contracts/contracts
 * -----------------------------------------
 * This adapter fetches daily fees, revenue, and supply-side rewards for The Graph protocol 
 * on Arbitrum using events emitted from relevant contracts.
 *
 * Fee Types & Sources:
 *
 * 1. Query Fees (User Payments) Paid by users for querying subgraphs.
 *    - Event: RebateCollected
 *    - Source Contract: STAKING (0x00669A4CF01450B64E8A2A20E9b1FCB71E61eF03)
 *    - Mapped to: dailyFees, dailyUserFees
 *
 * 2. Protocol Revenue (Burned Fees) A portion of query fees is burned as a protocol tax. 
 * Also includes curation taxes from signaling.
 *    - Event: RebateCollected (protocolTax)
 *    - Event: Signalled (curationTax)
 *    - Mapped to: dailyRevenue, dailyProtocolRevenue
 *
 * 3. Indexer Revenue (Supply Side Earnings) Earnings from query rebates and indexing rewards.
 *    - Event: RebateCollected (queryRebates)
 *    - Event: RewardsAssigned (amount)
 *    - Mapped to: dailySupplySideRevenue
 *
 * 4. Curator Revenue (Curation Fees) Earned by curators who stake GRT on subgraphs.
 *    - Event: RebateCollected (curationFees)
 *    - Event: Collected (tokens)
 *    - Mapped to: dailySupplySideRevenue
 *
 * 5. Delegator Revenue (Delegation Rewards) Rewards for delegating GRT to indexers.
 *    - Event: RebateCollected (delegationRewards)
 *    - Mapped to: dailySupplySideRevenue
 * 
 */

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GRAPH_CONTRACTS = {
  STAKING: "0x00669A4CF01450B64E8A2A20E9b1FCB71E61eF03",
  CURATION: "0x22d78fb4bc72e191C765807f8891B5e1785C8014",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();


  const rebateLogs = await options.getLogs({
    targets: [GRAPH_CONTRACTS.STAKING],
    eventAbi: `event RebateCollected(
      address assetHolder,
      address indexed indexer,
      bytes32 indexed subgraphDeploymentID,
      address indexed allocationID,
      uint256 epoch,
      uint256 tokens,
      uint256 protocolTax,
      uint256 curationFees,
      uint256 queryFees,
      uint256 queryRebates,
      uint256 delegationRewards
    )`,
  });

  rebateLogs.map((log: any) => {
    dailyFees.addCGToken("the-graph", BigInt(log.queryFees) / BigInt(1e18));
    // Add to user fees (query fees)
    dailyUserFees.addCGToken("the-graph", BigInt(log.queryFees) / BigInt(1e18));
    // Add to revenue (protocol tax)
    dailyRevenue.addCGToken("the-graph", BigInt(log.protocolTax) / BigInt(1e18));
    // Add to protocol revenue (protocol tax)
    dailyProtocolRevenue.addCGToken("the-graph", BigInt(log.protocolTax) / BigInt(1e18));
    // Add to holders revenue (curation fees + delegation rewards)
    dailyHoldersRevenue.addCGToken("the-graph", (BigInt(log.curationFees) + BigInt(log.delegationRewards)) / BigInt(1e18));
    // Add to supply side revenue (query rebates + curation fees + delegation rewards)
    dailySupplySideRevenue.addCGToken("the-graph", (BigInt(log.queryRebates) + BigInt(log.curationFees) + BigInt(log.delegationRewards)) / BigInt(1e18));
  });
  
  // Fetch Indexing Rewards from RewardsAssigned Event
  const rewardsLogs = await options.getLogs({
    targets: [GRAPH_CONTRACTS.STAKING],
    eventAbi: `event RewardsAssigned(
      address indexed indexer,
      address indexed allocationID,
      uint256 epoch,
      uint256 amount
    )`,
  });

  rewardsLogs.map((log: any) => {
    dailySupplySideRevenue.addCGToken("the-graph", BigInt(log.amount) / BigInt(1e18));
  });

  // Fetch Curation Fees from Signalled Event
  const signalledLogs = await options.getLogs({
    targets: [GRAPH_CONTRACTS.CURATION],
    eventAbi: `event Signalled(
      address indexed curator,
      bytes32 indexed subgraphDeploymentID,
      uint256 tokens,
      uint256 signal,
      uint256 curationTax
    )`,
  });

  signalledLogs.map((log: any) => {
    dailyFees.addCGToken("the-graph", BigInt(log.curationTax) / BigInt(1e18));
    dailyRevenue.addCGToken("the-graph", BigInt(log.curationTax) / BigInt(1e18));
    dailyProtocolRevenue.addCGToken("the-graph", BigInt(log.curationTax) / BigInt(1e18));
  });

  // Fetch Curation Earnings from Collected Event
  const collectedLogs = await options.getLogs({
    targets: [GRAPH_CONTRACTS.CURATION],
    eventAbi: `event Collected(
      bytes32 indexed subgraphDeploymentID,
      uint256 tokens
    )`,
  });

  collectedLogs.map((log: any) => {
    dailySupplySideRevenue.addCGToken("the-graph", BigInt(log.tokens) / BigInt(1e18));
  });

  // console.log(dailyFees, "dailyFees");
  // console.log(dailyRevenue, "dailyRevenue");
  // console.log(dailySupplySideRevenue, "dailySupplySideRevenue");

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: '2022-11-30', // New GRT Token contract creation date
      meta: {
        methodology: {
          fees: "Fees are calculated from two sources: 1) Query fees from RebateCollected event when users query subgraphs, and 2) Curation fees from Signalled event when curators signal subgraphs.",
          userFees: "User fees are calculated from the query fees portion of RebateCollected event, representing direct payments from users for querying subgraphs.",
          revenue: "Revenue is calculated from two sources: 1) Protocol tax portion of RebateCollected event, and 2) Curation tax from Signalled event when curators signal subgraphs.",
          protocolRevenue: "Protocol revenue is calculated from two sources: 1) Protocol tax portion of RebateCollected event, and 2) Curation tax from Signalled event when curators signal subgraphs.",
          holdersRevenue: "Holders revenue is calculated from RebateCollected event, combining curation fees and delegation rewards earned by token holders.",
          supplySideRevenue: "Supply-side revenue is calculated from multiple sources: 1) Query rebates from RebateCollected event, 2) Curation fees from RebateCollected event, 3) Delegation rewards from RebateCollected event, 4) Indexing rewards from RewardsAssigned event, and 5) Curation earnings from Collected event.",
        },
      },
    },
  },
};

export default adapter;
