import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getRevenueRatioShares } from "../../helpers/hyperliquid";
import { queryHyperliquidIndexerV2 } from "../../helpers/hyperliquid-v2";

// HIP-4 outcome markets, live on mainnet since 2026-05-02.
// https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
// Outcome fees are charged when closing or settling a position, never when opening, and outcome trading has no
// maker rebates. Hyperliquid's own fee was zero during the initial testing period: until 2026-08-14 the only
// outcome fees in the indexer are builder-code fees, Hyperliquid's share starts on 2026-08-15.

const methodology = {
  Volume: "USD value of HIP-4 outcome-market trades on Hyperliquid: price times shares over every buy and sell fill, halved so each trade is counted once. Merges, splits and settlements are not trades and are excluded.",
  NotionalVolume: "Shares traded on HIP-4 outcome markets, each share valued at its $1 payout, halved so each trade is counted once.",
  Fees: "Fees users pay when closing or settling HIP-4 outcome positions, including builder-code fees added by front-ends. Hyperliquid charged no outcome fee of its own before 15 Aug 2026.",
  Revenue: "99% of outcome fees net of builder-code fees, sent to the Assistance Fund to buy HYPE.",
  ProtocolRevenue: "Hyperliquid's protocol keeps no outcome fees; they go to the Assistance Fund and the HLP vault.",
  HoldersRevenue: "99% of outcome fees net of builder-code fees, used by the Assistance Fund to buy back HYPE.",
  SupplySideRevenue: "Builder-code fees paid to the front-ends that routed the trades, plus 1% of the remaining outcome fees to HLP vault depositors.",
}

const breakdownMethodology = {
  Fees: {
    'Outcome Fees': 'Fees on HIP-4 outcome positions closed or settled, excluding builder-code fees.',
    'Builder Code Fees': 'Fees added on top by front-ends building on Hyperliquid, charged on outcome sells.',
  },
  Revenue: {
    'Outcome Fees': '99% of outcome fees net of builder-code fees.',
  },
  SupplySideRevenue: {
    'Builder Code Distribution': 'Builder-code fees passed in full to the front-ends that routed the trades.',
    'HLP': '1% of outcome fees net of builder-code fees go to the HLP vault.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: '99% of outcome fees net of builder-code fees, used to buy back HYPE.',
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { holdersShare, hlpShare } = getRevenueRatioShares(options.startOfDay)
  const result = await queryHyperliquidIndexerV2(options)

  // outcome fees include builder-code fees, what is left after them is Hyperliquid's
  const hyperliquidFees = result.dailyOutcomeFees.clone()
  hyperliquidFees.add(result.dailyOutcomeBuildersFees.clone(-1))

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  dailyFees.add(hyperliquidFees, 'Outcome Fees')
  dailyFees.add(result.dailyOutcomeBuildersFees, 'Builder Code Fees')

  dailySupplySideRevenue.add(result.dailyOutcomeBuildersFees, 'Builder Code Distribution')
  dailySupplySideRevenue.add(hyperliquidFees.clone(hlpShare), 'HLP')

  dailyRevenue.add(hyperliquidFees.clone(holdersShare), 'Outcome Fees')
  dailyHoldersRevenue.add(hyperliquidFees.clone(holdersShare), METRIC.TOKEN_BUY_BACK)

  return {
    dailyVolume: result.dailyOutcomeVolume,
    dailyNotionalVolume: result.dailyOutcomeNotionalVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1, // the indexer serves daily summaries
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-05-02',
  methodology,
  breakdownMethodology,
};

export default adapter;
