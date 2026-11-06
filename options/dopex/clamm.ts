import { request, gql } from "graphql-request";
import { FetchOptions } from "../../adapters/types";

interface IGetChainStatsParams {
  graphUrl: string;
  dayStart: number;
  excludeMarkets?: string[];
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

async function getChainStats({ graphUrl, dayStart, excludeMarkets = [] }: IGetChainStatsParams) {
  const dailyVolumeQuery = gql`
    query GetStatsForDefiLamma($dayStart: Int!, $nextDayStart: Int!, $excludeMarkets: [String!]!) {
      optionMarkets(first: 1000) {
        totalFees
        totalVolume
        totalPremium
      }

      optionMarketDailyStats(
        first: 1000
        orderDirection: asc
        orderBy: startTimestamp
        where: { startTimestamp_gte: $dayStart, startTimestamp_lt: $nextDayStart, optionMarket_not_in: $excludeMarkets }
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
    { dayStart, nextDayStart, excludeMarkets }
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

// Current OptionMarketOTMFE deployments differ from the older mint event.
// Sources: clamm.stryke.xyz/en/earn and the public SDK ABI:
// https://github.com/stryke-xyz/sdk/blob/main/src/abi/OptionMarketOTMFEAbi.ts
const ROBINHOOD_MINT_EVENT = 'event LogMintOption(((address _handler,address pool,address hook,int24 tickLower,int24 tickUpper,uint256 liquidityToUse)[] optionTicks,uint256 ttl,uint256 maxCostAllowance,int24 tickLower,int24 tickUpper,bool isCall) _params,uint256 optionId,uint256 premiumAmount,uint256 size,uint256 protocolFees)';

const currentConfig: Record<string, { feeStrategy: string; fromBlock: number }> = {
  // FeeStrategy deployed in block 65228887; scan registrations from deployment:
  // https://robinhoodchain.blockscout.com/tx/0xe2b2282f4356c3653cf07d106b6fae2f499c793c1d89cf7ebf37f8fed8acffb0
  robinhood: { feeStrategy: '0x56b8221882e4707f998f3e9717fbdfde628ed1b2', fromBlock: 65228887 },
  // FeeStrategy deployed in block 379445413; scan registrations from deployment:
  // https://arbitrum.blockscout.com/tx/0xc9251017549f4a7fccdf06423044d3328dc29bcd5c8ee138c653843da0cde8fd
  arbitrum: { feeStrategy: '0x11d27d84e21dc88eb8c8aef3a1f9b869b5f95a87', fromBlock: 379445413 },
};

async function getCurrentMarkets(options: FetchOptions) {
  const { feeStrategy: target, fromBlock } = currentConfig[options.chain];
  if (await options.getToBlock() < fromBlock) return [];
  const registered = await options.getLogs({ target, fromBlock, cacheInCloud: true,
    eventAbi: 'event OptionMarketRegistered(address optionMarket)' });
  return [...new Set(registered.map((log: any) => log.optionMarket.toLowerCase()))] as string[];
}

async function getCurrentClammStats(options: FetchOptions, markets?: string[]) {
  // Discover market registrations through the reporting cutoff, retaining retired
  // markets and automatically covering later registrations on this deployment.
  markets = markets ?? await getCurrentMarkets(options);
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  if (!markets.length) return { dailyNotionalVolume, dailyPremiumVolume, dailyFees, dailyRevenue };
  // Asset addresses are constructor configuration emitted once on deployment.
  // Reading that event keeps historical runs independent of archive state.
  const initialized = await options.getLogs({ targets: markets, fromBlock: currentConfig[options.chain].fromBlock, flatten: false, cacheInCloud: true,
    eventAbi: 'event LogOptionsMarketInitialized(address primePool,address optionPricing,address dpFee,address callAsset,address putAsset)' });
  const logs = await options.getLogs({ targets: markets, eventAbi: ROBINHOOD_MINT_EVENT, flatten: false });
  logs.forEach((group: any[], i: number) => {
    if (initialized[i].length !== 1) throw new Error('Missing or ambiguous CLAMM market initialization');
    const { callAsset, putAsset } = initialized[i][0];
    for (const log of group) {
      // size is the actual borrowed asset amount, in call/put token base units.
      const asset = log._params.isCall ? callAsset : putAsset;
      dailyNotionalVolume.add(asset, log.size.toString());
      dailyPremiumVolume.add(asset, log.premiumAmount.toString());
      dailyFees.add(asset, log.protocolFees.toString(), ONCHAIN_LABELS.fees);
      dailyRevenue.add(asset, log.protocolFees.toString(), ONCHAIN_LABELS.revenue);
    }
  });
  return { dailyNotionalVolume, dailyPremiumVolume, dailyFees, dailyRevenue };
}

export { getChainStats, getOnchainStats, getCurrentClammStats, getCurrentMarkets };
