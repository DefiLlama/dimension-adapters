import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";

export const RUJIRA_START_DATE = "2026-01-01";

const GRAPHQL_ENDPOINT = "https://analytics.rujira.network/api/graphiql";
// Rujira analytics API amounts are fixed-point USD values with 1e8 precision, confirmed by the Rujira API team.
const AMOUNT_SCALE = new BigNumber(1e8);
const DAY_SECONDS = 24 * 60 * 60;
// Rujira's public GraphQL endpoint exposes Relay-style pagination (`first`/`after`) for finV3.pairs.
// https://analytics.rujira.network/api/graphiql
const PAGE_SIZE = 100;
// Safety guard for the paginated pair scan; 100 pages at PAGE_SIZE covers up to 10,000 FIN pairs.
const MAX_PAGES = 100;
// Daily bin queries request a small window so the adapter can select the exact UTC bin from GraphQL edges.
const DAILY_BIN_LIMIT = 3;

// Source for bRUNE staking contract: Rujira analytics GraphQL `staking.pools { edges { node { address symbol } } }`.
// https://analytics.rujira.network/api/graphiql
const BRUNE_STAKING_POOL = "thor179fex2rxd45caedmz4hxsnu42sw20lu0djyh4yukyh965sq8muuqptru2g";
// Rujira docs: bRUNE charges a 10% fee on bonding yield, with the remaining 90% distributed to staked bRUNE holders.
// https://docs.rujira.network/core-products/brune-liquid-bonded-rune
const BRUNE_PROTOCOL_FEE_SHARE = new BigNumber(10);
const BRUNE_USER_REWARD_SHARE = new BigNumber(90);

type Point = {
  value: string;
};

type Edge<T> = {
  node: T;
};

type DailyBin = {
  bin: string;
};

type FinAnalyticsBin = DailyBin & {
  volumeAppLayer: Point;
};

type FinOverviewBin = DailyBin & {
  revenue: Point;
  revenueAppLayer: Point;
  revenueBaseLayer: Point;
};

type BruneStakingBin = DailyBin & {
  totalRevenue: Point;
};

type SwapBin = DailyBin & {
  revenue: Point;
};

type Connection<T> = {
  edges: Edge<T>[];
};

type PageInfo = {
  endCursor: string | null;
  hasNextPage: boolean;
};

type FinPairsResponse = {
  finV3: {
    pairs: {
      edges: Array<Edge<{
        analyticsBins: Connection<FinAnalyticsBin>;
      }>>;
      pageInfo: PageInfo;
    };
  };
};

type DailyFeesResponse = {
  finV3: {
    overviewBins: Connection<FinOverviewBin>;
  };
  staking: {
    brune: Connection<BruneStakingBin>;
  };
  swap: {
    bins: Connection<SwapBin>;
  };
};

export type RujiraDailyFees = {
  bruneGrossRewardsUsd: number;
  bruneProtocolFeeUsd: number;
  bruneStakerRewardsUsd: number;
  finGrossFeesUsd: number;
  finRujiraRevenueUsd: number;
  finThorchainRevenueUsd: number;
  swapAffiliateFeesUsd: number;
};

const finPairsQuery = gql`
  query RujiraFinPairs($from: Timestamp!, $to: Timestamp!, $after: String, $first: Int!, $binFirst: Int!) {
    finV3 {
      pairs(first: $first, after: $after, sortBy: NAME, sortDir: ASC) {
        edges {
          node {
            analyticsBins(
              from: $from
              to: $to
              resolution: "1D"
              period: 1
              first: $binFirst
            ) {
              edges {
                node {
                  bin
                  volumeAppLayer { value }
                }
              }
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;

const dailyFeesQuery = gql`
  query RujiraDailyFees(
    $from: Timestamp!
    $to: Timestamp!
    $resolution: Resolution!
    $period: Int!
    $first: Int!
  ) {
    finV3 {
      overviewBins(
        from: $from
        to: $to
        resolution: $resolution
        period: $period
        first: $first
      ) {
        edges {
          node {
            bin
            revenue { value }
            revenueAppLayer { value }
            revenueBaseLayer { value }
          }
        }
      }
    }
    swap {
      bins(
        from: $from
        to: $to
        resolution: $resolution
        period: $period
        first: $first
      ) {
        edges {
          node {
            bin
            revenue { value }
          }
        }
      }
    }
    staking {
      brune: bins(
        contract: "${BRUNE_STAKING_POOL}"
        from: $from
        to: $to
        resolution: $resolution
        period: $period
        first: $first
      ) {
        edges {
          node {
            bin
            totalRevenue { value }
          }
        }
      }
    }
  }
`;

function dailyRange(startTimestamp: number) {
  const endTimestamp = startTimestamp + DAY_SECONDS;

  return {
    from: new Date(startTimestamp * 1000).toISOString(),
    to: new Date(endTimestamp * 1000).toISOString(),
  };
}

function isRequestedBin(bin: string, startTimestamp: number) {
  return Math.floor(new Date(bin).getTime() / 1000) === startTimestamp;
}

function getDailyBin<T extends DailyBin>(connection: Connection<T>, startTimestamp: number): T | undefined {
  return connection.edges.find(({ node }) => isRequestedBin(node.bin, startTimestamp))?.node;
}

function amountToUsd(value?: string): BigNumber {
  return new BigNumber(value || 0).div(AMOUNT_SCALE);
}

function asNumber(value: BigNumber, label: string): number {
  if (!value.isFinite()) throw new Error(`Rujira API returned an invalid ${label}`);
  return value.toNumber();
}

/** Returns total USD FIN volume by summing app-layer analytics across every paginated pair. */
export async function fetchRujiraDailyVolumeUsd(startTimestamp: number): Promise<number> {
  const range = dailyRange(startTimestamp);
  let after: string | null = null;
  let volumeUsd = new BigNumber(0);

  for (let page = 0; page < MAX_PAGES; page++) {
    const response: FinPairsResponse = await request(GRAPHQL_ENDPOINT, finPairsQuery, {
      ...range,
      after,
      binFirst: DAILY_BIN_LIMIT,
      first: PAGE_SIZE,
    });

    const pairs = response.finV3.pairs;
    for (const { node: pair } of pairs.edges) {
      const analytics = getDailyBin(pair.analyticsBins, startTimestamp);
      if (analytics) volumeUsd = volumeUsd.plus(amountToUsd(analytics.volumeAppLayer.value));
    }

    if (!pairs.pageInfo.hasNextPage) return asNumber(volumeUsd, "FIN volume");
    if (!pairs.pageInfo.endCursor) throw new Error("Rujira FIN pagination is missing an end cursor");
    after = pairs.pageInfo.endCursor;
  }

  throw new Error(`Rujira FIN pagination exceeded ${PAGE_SIZE * MAX_PAGES} pairs`);
}

/** Returns daily Rujira fee inputs from FIN, Swap, and bRUNE analytics. */
export async function fetchRujiraDailyFees(startTimestamp: number): Promise<RujiraDailyFees> {
  const range = dailyRange(startTimestamp);
  const response: DailyFeesResponse = await request(GRAPHQL_ENDPOINT, dailyFeesQuery, {
    ...range,
    first: DAILY_BIN_LIMIT,
    period: 1,
    resolution: "1D",
  });

  const fin = getDailyBin(response.finV3.overviewBins, startTimestamp);
  const swap = getDailyBin(response.swap.bins, startTimestamp);
  const brune = getDailyBin(response.staking.brune, startTimestamp);

  const bruneStakerRewards = amountToUsd(brune?.totalRevenue.value);
  // totalRevenue is the net user share; protocolRevenue is transfer-timed, so accrue the fee from net rewards.
  const bruneProtocolFee = bruneStakerRewards.times(BRUNE_PROTOCOL_FEE_SHARE).div(BRUNE_USER_REWARD_SHARE);

  return {
    bruneGrossRewardsUsd: asNumber(bruneStakerRewards.plus(bruneProtocolFee), "bRUNE gross rewards"),
    bruneProtocolFeeUsd: asNumber(bruneProtocolFee, "bRUNE protocol fee"),
    bruneStakerRewardsUsd: asNumber(bruneStakerRewards, "bRUNE staker rewards"),
    finGrossFeesUsd: asNumber(amountToUsd(fin?.revenue.value), "FIN gross fees"),
    finRujiraRevenueUsd: asNumber(amountToUsd(fin?.revenueAppLayer.value), "FIN Rujira revenue"),
    finThorchainRevenueUsd: asNumber(amountToUsd(fin?.revenueBaseLayer.value), "FIN THORChain revenue"),
    swapAffiliateFeesUsd: asNumber(amountToUsd(swap?.revenue.value), "Swap affiliate fees"),
  };
}
