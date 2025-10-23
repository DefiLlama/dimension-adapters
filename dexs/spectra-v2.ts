import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
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
          id
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
              type
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
    blacklistPools?: Array<string>;
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
    blacklistPools: ["0x447d24edf78b20a4cf748a7cee273510edf87df1"],
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
  [CHAIN.KATANA]: {
    id: 747474,
    start: "2025-07-02",
    protocolSubgraphUrl: sdk.graph.modifyEndpoint("EM1PDEWqo1BWaLEW5FotmHtVK1HX8z7eFnLVfDRLjfQh"),
    limit: 1000,
  },
};

type Address = `0x${string}`;
type Transaction = {
  poolInTransaction: {
    id: string;
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
    type: "FEE" | "REWARD";
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
    if (chains[chain].blacklistPools && new Set(chains[chain].blacklistPools).has(transaction.poolInTransaction.id)) {
      return;
    }

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
  const dailyVotingFeesRevenue = createBalances();
  dailyVotingFeesRevenue.chain = CHAIN.BASE; // revenue is generated on all chains, but redistributed to holders exclusively on Base
  const dailyVotingIncentivesRevenue = dailyVotingFeesRevenue.clone();

  const graphQLClient = new GraphQLClient(GOVERNANCE_SUBGRAPH_URL);
  const dailyData = (
    await graphQLClient.request(
      GQL_QUERIES.DAILY_VOTING_REWARDS(startTimestamp, endTimestamp)
    )
  ).votingRewards as VotingReward[];

  // Count both reward types (voting incentives + fees) separately
  dailyData.forEach((reward) => {
    // Only count rewards for pools on the current chain
    if (reward.distributor.governancePool.chainId === chains[chain].id.toString()) {
      if (reward.distributor.type === "FEE") {
        dailyVotingFeesRevenue.add(reward.address, reward.amount.toString());
      } else {
        dailyVotingIncentivesRevenue.add(
          reward.address,
          reward.amount.toString()
        );
      }
    }
  });

  return [dailyVotingFeesRevenue, dailyVotingIncentivesRevenue];
};

// https://docs.spectra.finance/tokenomics/fees
const fetch: FetchV2 = async (options) => {
  const { dailyFees, dailyVolume } = await fetchDailyFeesAndVolume(options);

  const dailyRevenue = dailyFees.clone(0.8);
  const dailySupplySideRevenue = dailyFees.clone(0.2);
  const [dailyVotingFeesRevenue, dailyVotingIncentivesRevenue] = await fetchDailyHoldersRevenue(options);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyVotingFeesRevenue,
    dailyBribesRevenue: dailyVotingIncentivesRevenue,
  };
};

const methodology = {
  Fees: "All fees paid by yield traders.",
  Revenue: "80% Trading fees collected as revenue.",
  ProtocolRevenue: "No protocol revenue.",
  SupplySideRevenue: "20% trading fees distributed to LPs.",
  BribesRevenue: "Voting incentives distributed to veSPECTRA.",
  HoldersRevenue: "60% Trading fees distributed to veSPECTRA.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {},
};

for (const [chain, config] of Object.entries(chains)) {
  (adapter.adapter as any)[chain] = {
    fetch,
    start: config.start,
  };
}

export default adapter;
