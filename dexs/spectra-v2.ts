import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";
import { gql, GraphQLClient } from "graphql-request";

const DEFAULT_SUBGRAPH_LIMIT = 1_000;

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
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-mainnet/prod/gn",
  },
  [CHAIN.ARBITRUM]: {
    id: 42161,
    start: "2024-07-01",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-arbitrum/prod/gn",
  },
  [CHAIN.OPTIMISM]: {
    id: 10,
    start: "2024-07-01",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-optimism/prod/gn",
  },
  [CHAIN.BASE]: {
    id: 8453,
    start: "2024-07-01",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-base/prod/gn",
    blacklistPools: ["0x447d24edf78b20a4cf748a7cee273510edf87df1"],
  },
  [CHAIN.SONIC]: {
    id: 146,
    start: "2024-12-27",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-sonic/prod/gn",
  },
  [CHAIN.HEMI]: {
    id: 43111,
    start: "2025-03-06",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-hemi/prod/gn",
  },
  [CHAIN.AVAX]: {
    id: 43114,
    start: "2025-05-26",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-avalanche/prod/gn",
  },
  [CHAIN.BSC]: {
    id: 56,
    start: "2025-05-26",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-bsc/prod/gn",
  },
  [CHAIN.HYPERLIQUID]: {
    id: 999,
    start: "2025-06-01",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-hyperevm/prod/gn",
    blacklistPools: ["0x60f393a4a7e41aae2bfa0f401e1f114c3ad088f6"] // Returns inflated values, for example this 4$ transaction returns 195k in volume: https://hyperevmscan.io/tx/0x4502e2238e3def500bc11387c40ab85b08b062b9572619a9a4051b36f7b4fb84
  },
  [CHAIN.KATANA]: {
    id: 747474,
    start: "2025-07-02",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-katana/prod/gn",
  },
  [CHAIN.FLARE]: {
    id: 14,
    start: "2025-08-22",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-flare/prod/gn",
  },
  [CHAIN.MONAD]: {
    id: 143,
    start: "2025-11-25",
    protocolSubgraphUrl:
      "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-monad/prod/gn",
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
  "https://api.goldsky.com/api/public/project_cm55feuq3euos01xjb3w504ls/subgraphs/spectra-governance/prod/gn";

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
    if (
      chains[chain].blacklistPools &&
      new Set(chains[chain].blacklistPools).has(
        transaction.poolInTransaction.id
      )
    ) {
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
    if (
      reward.distributor.governancePool.chainId === chains[chain].id.toString()
    ) {
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
  const [dailyVotingFeesRevenue, dailyVotingIncentivesRevenue] =
    await fetchDailyHoldersRevenue(options);

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
