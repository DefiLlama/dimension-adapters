import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";

export const RUJIRA_START_DATE = "2026-01-01";

// Analytics v2 returns unscaled decimal USD strings, unlike the legacy 1e8-scaled amounts.
// Field definitions: https://analytics.rujira.network/api/v2/graphql
const GRAPHQL_ENDPOINT = "https://analytics.rujira.network/api/v2/graphql";
const DAY_SECONDS = 24 * 60 * 60;
// bRUNE staking pool retained from the legacy source as an on-chain reference:
// thor179fex2rxd45caedmz4hxsnu42sw20lu0djyh4yukyh965sq8muuqptru2g
// Source: https://analytics.rujira.network/api/graphiql (staking.pools).
// https://docs.rujira.network/core-products/brune-liquid-bonded-rune
// The 10% protocol fee leaves 90% of bonding rewards for both staking modes combined.
const BRUNE_PROTOCOL_FEE_SHARE = new BigNumber(10);
const BRUNE_USER_REWARD_SHARE = new BigNumber(90);

type Decimal = string | null;

type DailyVolumeResponse = {
  analytics: {
    products: {
      trade: { summary: { volume: Decimal } | null } | null;
    } | null;
  } | null;
};

type DailyFeesResponse = {
  analytics: {
    products: {
      trade: {
        summary: { revenue: Decimal; thorchainRevenueShare: Decimal } | null;
      } | null;
      vs: { summary: { protocolFees: Decimal } | null } | null;
      swap: { summary: { revenue: Decimal } | null } | null;
    } | null;
    staking: { summary: { revenueToStakers: Decimal } | null } | null;
  } | null;
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

const dailyVolumeQuery = gql`
  query RujiraDailyVolume($range: TimeRangeInput!) {
    analytics {
      products {
        trade {
          summary(range: $range) {
            volume(source: TOTAL)
          }
        }
      }
    }
  }
`;

const dailyFeesQuery = gql`
  query RujiraDailyFees($range: TimeRangeInput!) {
    analytics {
      products {
        trade {
          summary(range: $range) {
            revenue(recipient: TOTAL, nature: TOTAL)
            thorchainRevenueShare(basis: ACTUAL)
          }
        }
        vs {
          summary(range: $range) {
            protocolFees
          }
        }
        swap {
          summary(range: $range) {
            revenue(recipient: RUJIRA, source: AFFILIATE_FEES)
          }
        }
      }
      staking(token: BRUNE) {
        summary(range: $range) {
          revenueToStakers(currency: USD)
        }
      }
    }
  }
`;

function dailyRange(startTimestamp: number) {
  if (!Number.isInteger(startTimestamp) || startTimestamp % DAY_SECONDS !== 0)
    throw new Error("Rujira analytics requires a UTC midnight start timestamp");

  const endTimestamp = startTimestamp + DAY_SECONDS;
  if (endTimestamp * 1000 > Date.now())
    throw new Error("Rujira analytics requires a completed UTC day");

  // Summaries cover exactly [from, to). History timestamps instead label period close.
  return {
    from: new Date(startTimestamp * 1000).toISOString(),
    to: new Date(endTimestamp * 1000).toISOString(),
  };
}

function readMetric(value: Decimal | undefined, label: string): BigNumber {
  // A null metric is unavailable, not a measured zero; throwing keeps the day missing on refill.
  if (value == null) throw new Error(`Rujira Analytics v2 is missing ${label}`);
  const amount = new BigNumber(value);
  if (typeof value !== "string" || !amount.isFinite() || amount.isNegative())
    throw new Error(`Rujira Analytics v2 returned an invalid ${label}`);
  return amount;
}

function asNumber(value: BigNumber, label: string): number {
  const amount = value.toNumber();
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error(`Rujira Analytics v2 returned an invalid ${label}`);
  return amount;
}

/** Returns the completed UTC day's FIN volume, equivalent to summing all FIN pairs once. */
export async function fetchRujiraDailyVolumeUsd(startTimestamp: number): Promise<number> {
  const response: DailyVolumeResponse = await request(GRAPHQL_ENDPOINT, dailyVolumeQuery, {
    range: dailyRange(startTimestamp),
  });
  return asNumber(readMetric(response.analytics?.products?.trade?.summary?.volume, "FIN volume"), "FIN volume");
}

/** Returns FIN, Swap and bRUNE inputs with the existing DefiLlama accounting scope. */
export async function fetchRujiraDailyFees(startTimestamp: number): Promise<RujiraDailyFees> {
  const response: DailyFeesResponse = await request(GRAPHQL_ENDPOINT, dailyFeesQuery, {
    range: dailyRange(startTimestamp),
  });
  const products = response.analytics?.products;
  const trade = products?.trade?.summary;

  // Legacy FIN revenue included trading fees and arbitrage profits from the FIN pairs.
  // V2 Trade TOTAL additionally includes VS payments to the fee collector. Remove those
  // to preserve the FIN-pair scope; this difference equals the sum of per-pair revenue.
  const tradeRevenue = readMetric(trade?.revenue, "Trade revenue");
  const vsProtocolFees = readMetric(products?.vs?.summary?.protocolFees, "VS protocol fees");
  const finGrossFees = tradeRevenue.minus(vsProtocolFees);
  if (finGrossFees.isNegative())
    throw new Error("Rujira Analytics v2 VS protocol fees exceed Trade revenue");

  // ACTUAL is the observed collector allocation, not the theoretical target or a fixed 50%.
  // No allocation is needed for a measured zero FIN total; nonzero totals require the share.
  const thorchainShare = finGrossFees.isZero() && trade?.thorchainRevenueShare == null
    ? new BigNumber(0)
    : readMetric(trade?.thorchainRevenueShare, "FIN THORChain revenue share");
  if (thorchainShare.gt(1))
    throw new Error("Rujira Analytics v2 FIN THORChain revenue share exceeds 1");
  const finThorchainRevenue = finGrossFees.times(thorchainShare);
  const finRujiraRevenue = finGrossFees.minus(finThorchainRevenue);

  const bruneStakerRewards = readMetric(response.analytics?.staking?.summary?.revenueToStakers, "bRUNE net rewards");
  // Net rewards include yielding and auto-compounding users. Accrue the 10% fee from
  // their 90% share, preserving the legacy calculation rather than transfer-timed protocolRevenue.
  const bruneProtocolFee = bruneStakerRewards.times(BRUNE_PROTOCOL_FEE_SHARE).div(BRUNE_USER_REWARD_SHARE);

  return {
    bruneGrossRewardsUsd: asNumber(bruneStakerRewards.plus(bruneProtocolFee), "bRUNE gross rewards"),
    bruneProtocolFeeUsd: asNumber(bruneProtocolFee, "bRUNE protocol fee"),
    bruneStakerRewardsUsd: asNumber(bruneStakerRewards, "bRUNE net rewards"),
    finGrossFeesUsd: asNumber(finGrossFees, "FIN gross fees"),
    finRujiraRevenueUsd: asNumber(finRujiraRevenue, "FIN Rujira revenue"),
    finThorchainRevenueUsd: asNumber(finThorchainRevenue, "FIN THORChain revenue"),
    swapAffiliateFeesUsd: asNumber(readMetric(products?.swap?.summary?.revenue, "Swap affiliate fees"), "Swap affiliate fees"),
  };
}
