import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getRevenueRatioShares, LLAMA_HL_INDEXER_FROM_TIME, queryHyperliquidIndexer, queryHypurrscanApi } from "../../helpers/hyperliquid";

const methodology = {
  Fees: "Include perps trading fees and builders fees, excluding spot fees.",
  Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding builders fees.",
  ProtocolRevenue: "Protocol doesn't keep any fees.",
  HoldersRevenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding builders fees.",
  SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3% + fees for builders.",
}

const breakdownMethodology = {
  Fees: {
    'Perp Fees': 'Perp trade fees collected as revenue, excluding spot fees.',
    'Builders Revenue': 'Perp trade fees share for builders fees, excluding spot fees.',
  },
  Revenue: {
    'Perp Fees': '99% of perp trade fees, excluding spot fees and builders fees.',
  },
  SupplySideRevenue: {
    'Builders Revenue': 'Perp trade rees share for builders.',
    'HLP': '1% of the perp trade fees go to HLP vault (used to be 3% before 30 Aug 2025)',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "99% of perp trade fees (excluding spot fees and builders fees) for buy back HYPE tokens."
  },
}

async function fetch(_1: number, _: any,  options: FetchOptions): Promise<FetchResultV2> {
  const { holdersShare, hlpShare } = getRevenueRatioShares(options.startOfDay)

  if (options.startOfDay < LLAMA_HL_INDEXER_FROM_TIME) {
    // get fees from hypurrscan, no volume
    const result = await queryHypurrscanApi(options);

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    dailyFees.add(result.dailyPerpFees, 'Perp Fees')
    dailySupplySideRevenue.add(result.dailyPerpFees.clone(hlpShare), 'HLP')
    dailyHoldersRevenue.add(result.dailyPerpFees.clone(holdersShare), METRIC.TOKEN_BUY_BACK)

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
    }
  } else {
    // get volume and fees from indexer
    const result = await queryHyperliquidIndexer(options);

    // perp volume
    const dailyVolume = result.dailyPerpVolume;

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    // all perp fees
    dailyFees.add(result.dailyPerpRevenue, 'Perp Fees')
    dailyFees.add(result.dailyBuildersRevenue, 'Builders Revenue')

    // perp fees - builders revenue
    dailyRevenue.add(result.dailyPerpRevenue, 'Perp Fees')

    // builders fees + 1% revenue
    dailySupplySideRevenue.add(result.dailyPerpRevenue.clone(hlpShare), 'HLP')
    dailySupplySideRevenue.add(result.dailyBuildersRevenue, 'Builders Revenue')
    
    // 99% of revenue
    dailyHoldersRevenue.add(result.dailyPerpRevenue.clone(holdersShare), METRIC.TOKEN_BUY_BACK)

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
      openInterestAtEnd: result.currentPerpOpenInterest,
    }
  }
}

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2024-12-23',
    },
  },
};

export default adapter;
