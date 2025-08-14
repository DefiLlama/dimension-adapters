import ADDRESSES from "../helpers/coreAssets.json";
import {
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
  FetchV2,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";
import { gql, GraphQLClient } from "graphql-request";

const DEFAULT_SUBGRAPH_LIMIT = 10_000;

const GQL_QUERIES = {
  DAILY_TRANSACTIONS: (
    startTimestamp: number,
    endTimestamp: number,
    limit = DEFAULT_SUBGRAPH_LIMIT
  ) => gql`
    {
      transactions(
        where: {
          createdAtTimestamp_gte: ${startTimestamp}
          createdAtTimestamp_lt: ${endTimestamp}
          feeUnderlying_not: "0"
        }
        first: ${limit}
      ) {
        poolInTransaction {
          futureVault {
            underlyingAsset {
              address
            }
          }
        }
        feeUnderlying
        valueUnderlying
      }
    }
  `,
  DAILY_VOTING_REWARDS: (startTimestamp: number, endTimestamp: number) => gql`
        {
          votingRewards(
            where: {createdAtTimestamp_gte: ${startTimestamp}, createdAtTimestamp_lt: ${endTimestamp} }
          ) {
            address
            amount
            distributor {
              governancePool {
                chainId
              }
            }
          }
        }
      `,
};

const chains: {
  [chain: string]: {
    id: number;
    start: string;
    protocolSubgraphUrl: string;
    limit?: number;
  };
} = {
  [CHAIN.ETHEREUM]: {
    id: 1,
    start: "2024-07-01",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-mainnet/api",
  },
  [CHAIN.ARBITRUM]: {
    id: 42161,
    start: "2024-07-01",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-arbitrum/api",
  },
  [CHAIN.OPTIMISM]: {
    id: 10,
    start: "2024-07-01",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-optimism/api",
  },
  [CHAIN.BASE]: {
    id: 8453,
    start: "2024-07-01",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-base/api",
  },
  [CHAIN.SONIC]: {
    id: 146,
    start: "2024-12-27",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-sonic/api",
  },
  [CHAIN.HEMI]: {
    id: 43111,
    start: "2025-03-06",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-hemi/api",
  },
  [CHAIN.AVAX]: {
    id: 43114,
    start: "2025-05-26",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-avalanche/api",
  },
  [CHAIN.BSC]: {
    id: 56,
    start: "2025-05-26",
    protocolSubgraphUrl:
      "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/spectra-bsc/api",
  },
  [CHAIN.HYPERLIQUID]: {
    id: 999,
    start: "2025-06-01",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-hyperevm/1.2.1/gn",
    limit: 1000,
  },
};

type Address = `0x${string}`;
type Transaction = {
  poolInTransaction: {
    futureVault: {
      underlyingAsset: {
        address: Address;
      };
    };
  };
  feeUnderlying: string;
  valueUnderlying: string;
};
type VotingReward = {
  address: Address;
  amount: BigNumber;
  distributor: {
    governancePool: {
      chainId: string;
    };
  };
};

const GOVERNANCE_SUBGRAPH_URL =
  "https://subgraph.satsuma-prod.com/957f3120c2b2/perspective/governance/api";

const fetchDailyFeesAndVolume = async ({
  chain,
  createBalances,
  startTimestamp,
  endTimestamp,
}: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyVolume = createBalances();

  const graphQLClient = new GraphQLClient(chains[chain].protocolSubgraphUrl);
  const dailyData = (
    await graphQLClient.request(
      GQL_QUERIES.DAILY_TRANSACTIONS(
        startTimestamp,
        endTimestamp,
        chains[chain].limit
      )
    )
  ).transactions as Transaction[];

  dailyData.forEach((transaction) => {
    dailyFees.add(
      transaction.poolInTransaction.futureVault.underlyingAsset.address,
      transaction.feeUnderlying
    );
    dailyVolume.add(
      transaction.poolInTransaction.futureVault.underlyingAsset.address,
      transaction.valueUnderlying
    );
  });

  return { dailyFees, dailyVolume };
};

const fetchDailyHoldersRevenue = async ({
  chain,
  createBalances,
  startTimestamp,
  endTimestamp,
}: FetchOptions) => {
  const dailyHoldersRevenue = createBalances();
  dailyHoldersRevenue.chain = CHAIN.BASE; // revenue is generated on all chains, but redistributed to holders exclusively on Base

  const graphQLClient = new GraphQLClient(GOVERNANCE_SUBGRAPH_URL);
  const dailyData = (
    await graphQLClient.request(
      GQL_QUERIES.DAILY_VOTING_REWARDS(startTimestamp, endTimestamp)
    )
  ).votingRewards as VotingReward[];

  // Count all rewards (voting incentives + fees) as holders revenue
  dailyData.forEach((reward) => {
    if (
      reward.distributor.governancePool.chainId === chains[chain].id.toString() // Only count rewards for pools on the current chain
    ) {
      dailyHoldersRevenue.add(reward.address, reward.amount.toString());
    }
  });

  return dailyHoldersRevenue;
};

const fetch: FetchV2 = async (options) => {
  const { dailyFees, dailyVolume } = await fetchDailyFeesAndVolume(options);
  return {
    dailyFees,
    dailyVolume,
    dailyHoldersRevenue: await fetchDailyHoldersRevenue(options),
  };
};

const meta = {
  methodology: {
    Fees: "All fees paid by yield traders.",
    HoldersRevenue:
      "Trading fees and voting incentives distributed to veSPECTRA",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2024-07-01",
      meta,
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2024-07-01",
      meta,
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2024-07-01",
      meta,
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2024-07-01",
      meta,
    },
    [CHAIN.SONIC]: {
      fetch,
      start: "2024-12-27",
      meta,
    },
    [CHAIN.HEMI]: {
      fetch,
      start: "2025-03-06",
      meta,
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "2025-05-26",
      meta,
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2025-05-26",
      meta,
    },
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-06-01",
      meta,
    },
  },
};

export default adapter;
