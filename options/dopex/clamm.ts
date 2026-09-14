import { request, gql } from "graphql-request";
import { FetchOptions } from "../../adapters/types";

interface IGetChainStatsParams {
  graphUrl: string;
  dayStart: number;
}

interface IQueryResponse {
  optionMarkets: Array<{
    totalFees: string;
    totalVolume: string;
    totalPremium: string;
  }>;
  optionMarketDailyStats: Array<{
    volume: string;
    fees: string;
    premium: string;
  }>;
}

async function getChainStats({ graphUrl, dayStart }: IGetChainStatsParams) {
  const dailyVolumeQuery = gql`
    query GetStatsForDefiLamma($dayStart: Int!, $nextDayStart: Int!) {
      optionMarkets(first: 1000) {
        totalFees
        totalVolume
        totalPremium
      }

      optionMarketDailyStats(
        first: 1000
        orderDirection: asc
        orderBy: startTimestamp
        where: { startTimestamp_gte: $dayStart, startTimestamp_lt: $nextDayStart }
      ) {
        volume
        fees
        premium
      }
    }
  `;

  // optionMarketDailyStats buckets are keyed by UTC day start, same as options.startOfDay
  const nextDayStart = dayStart + 86400;

  const queryResponse: IQueryResponse = await request(
    graphUrl,
    dailyVolumeQuery,
    { dayStart, nextDayStart }
  );

  const daily = queryResponse.optionMarketDailyStats.reduce(
    (acc, market) => {
      return {
        dailyNotionalVolume: acc.dailyNotionalVolume + Number(market.volume),
        dailyPremiumVolume: acc.dailyPremiumVolume + Number(market.premium),
        dailyRevenue: acc.dailyRevenue + Number(market.fees),
      };
    },
    {
      dailyNotionalVolume: 0,
      dailyPremiumVolume: 0,
      dailyRevenue: 0,
    }
  );

  return {
    ...daily,
    dailyFees: daily.dailyRevenue,
  };
}

// Emitted by every CLAMM option market (DopexV2OptionMarketV2 / OptionMarketOTMFE) on each option purchase:
// https://github.com/stryke-xyz/clamm/blob/main/src/DopexV2OptionMarketV2.sol
//  - totalAssetWithdrawn: liquidity borrowed from the CL ticks to back the option (call asset for
//    calls, put asset for puts) -> notional
//  - premiumAmount: premium paid by the buyer in that same asset, donated back to the LP ticks
//  - protocolFees: feePercentage * premiumAmount (DopexV2ClammFeeStrategyV2), transferred to feeTo
const MINT_OPTION_EVENT =
  "event LogMintOption(address user, uint256 tokenId, bool isCall, uint256 premiumAmount, uint256 totalAssetWithdrawn, uint256 protocolFees)";

export const ONCHAIN_LABELS = {
  fees: "Option Purchase Fees",
  revenue: "Option Purchase Fees To Protocol",
};

// callAsset()/putAsset() of the option market, hardcoded so historical days before a market was
// deployed don't need block-pinned calls against a contract that doesn't exist yet.
export interface IOptionMarket {
  address: string;
  callAsset: string;
  putAsset: string;
}

async function getOnchainStats(options: FetchOptions, markets: IOptionMarket[]) {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logsPerMarket = await options.getLogs({
    targets: markets.map((m) => m.address),
    eventAbi: MINT_OPTION_EVENT,
    flatten: false,
  });

  logsPerMarket.forEach((logs: any[], i: number) => {
    const { callAsset, putAsset } = markets[i];
    for (const log of logs) {
      const asset = log.isCall ? callAsset : putAsset;
      dailyNotionalVolume.add(asset, log.totalAssetWithdrawn);
      dailyPremiumVolume.add(asset, log.premiumAmount);
      dailyFees.add(asset, log.protocolFees, ONCHAIN_LABELS.fees);
      dailyRevenue.add(asset, log.protocolFees, ONCHAIN_LABELS.revenue);
    }
  });

  return { dailyNotionalVolume, dailyPremiumVolume, dailyFees, dailyRevenue };
}

export { getChainStats, getOnchainStats };
