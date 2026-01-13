import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getRevenueRatioShares, LLAMA_HL_INDEXER_FROM_TIME, queryHyperliquidIndexer, queryHypurrscanApi } from "../../helpers/hyperliquid";

const methodology = {
  Fees: "Include spot trading fees and unit protocol fees, excluding perps fees.",
  Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding unit protocol fees.",
  ProtocolRevenue: "Protocol doesn't keep any fees.",
  HoldersRevenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding unit protocol fees.",
  SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3% + fees for unit protocol.",
}

const breakdownMethodology = {
  Fees: {
    'Spot Fees': 'Fees collected on all spot trades, excluding trades on markets with Unit assets (eg bridged BTC).',
    'Spot fees on Unit markets': 'Fees from spot trades on markets that include an asset deployed by Unit, in these spot markets all fees go to Unit.',
  },
  Revenue: {
    'Spot Fees': '99% of spot trade fees, excluding perp fees and unit protocol fees.',
  },
  SupplySideRevenue: {
    'Unit Revenue': 'All fees earned on Unit spot markets go to Unit',
    'HLP': '1% of the spot fees go to HLP vault (used to be 3% before 30 Aug 2025)',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "99% of spot trade fees (excluding perp fees and unit protocol fees) for buy back HYPE tokens."
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

    dailyFees.add(result.dailySpotFees, 'Spot Fees')
    dailyRevenue.add(result.dailySpotFees.clone(holdersShare), 'Spot Fees')
    dailySupplySideRevenue.add(result.dailySpotFees.clone(hlpShare), 'HLP')
    dailyHoldersRevenue.add(result.dailySpotFees.clone(holdersShare), METRIC.TOKEN_BUY_BACK)

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
    }
  } else {
    const result = await queryHyperliquidIndexer(options);

    // spot volume
    const dailyVolume = result.dailySpotVolume;

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    // all spot fees
    dailyFees.add(result.dailySpotRevenue, 'Spot Fees')
    dailyFees.add(result.dailyUnitRevenue, 'Spot fees on Unit markets')

    // unit revenue + 1% spot revenue
    dailySupplySideRevenue.add(result.dailySpotRevenue.clone(hlpShare), 'HLP')
    dailySupplySideRevenue.add(result.dailyUnitRevenue, 'Unit Revenue')
    
    // 99% of spot fees
    dailyRevenue.add(result.dailySpotRevenue.clone(holdersShare), 'Spot Fees')
    dailyHoldersRevenue.add(result.dailySpotRevenue.clone(holdersShare), METRIC.TOKEN_BUY_BACK)

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
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