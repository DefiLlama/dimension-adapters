import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import {
  getRevenueRatioShares,
  LLAMA_HL_INDEXER_FROM_TIME,
  queryHyperliquidIndexer,
  queryHypurrscanApi,
  queryHypurrscanSpotAuctionBurns,
} from "../../helpers/hyperliquid";

const SPOT_DEPLOYMENT_AUCTION_BURNS = "Spot Deployment Auction Burns";

const methodology = {
  Fees: "Include spot trading fees, unit protocol fees, and HYPE burned in successful HIP-1 token-deployment auctions, excluding perps fees.",
  Revenue: "97% of spot trading fees before 30 Aug 2025 and 99% thereafter go to Assistance Fund for buying HYPE tokens, excluding unit protocol fees; HYPE paid in successful HIP-1 token-deployment auctions is burned.",
  ProtocolRevenue: "Protocol doesn't keep any fees.",
  HoldersRevenue: "97% of spot trading fees before 30 Aug 2025 and 99% thereafter go to Assistance Fund for buying HYPE tokens, excluding unit protocol fees; HYPE paid in successful HIP-1 token-deployment auctions is permanently burned.",
  SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3% + fees for unit protocol.",
}

const breakdownMethodology = {
  Fees: {
    'Spot Fees': 'Fees collected on all spot trades, excluding trades on markets with Unit assets (eg bridged BTC).',
    'Spot fees on Unit markets': 'Fees from spot trades on markets that include an asset deployed by Unit, in these spot markets all fees go to Unit.',
    [SPOT_DEPLOYMENT_AUCTION_BURNS]: 'HYPE paid and permanently burned in successful HIP-1 token-deployment auctions.',
  },
  Revenue: {
    'Spot Fees': '97% of spot trade fees before 30 Aug 2025 and 99% thereafter, excluding perp fees and unit protocol fees.',
    [SPOT_DEPLOYMENT_AUCTION_BURNS]: 'HIP-1 token-deployment auction payments permanently burned rather than retained or distributed.',
  },
  SupplySideRevenue: {
    'Unit Revenue': 'All fees earned on Unit spot markets go to Unit',
    'HLP': '1% of the spot fees go to HLP vault (used to be 3% before 30 Aug 2025)',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "97% of spot trade fees before 30 Aug 2025 and 99% thereafter, excluding perp fees and unit protocol fees, for buying back HYPE tokens.",
    [SPOT_DEPLOYMENT_AUCTION_BURNS]: 'HYPE permanently removed from supply through successful HIP-1 token-deployment auctions.',
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { holdersShare, hlpShare } = getRevenueRatioShares(options.startOfDay)

  if (options.startOfDay < LLAMA_HL_INDEXER_FROM_TIME) {
    // get fees from hypurrscan, no volume
    const [result, dailySpotAuctionBurns] = await Promise.all([
      queryHypurrscanApi(options),
      queryHypurrscanSpotAuctionBurns(options),
    ]);

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    dailyFees.add(result.dailySpotFees, 'Spot Fees')
    dailyFees.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

    dailyRevenue.add(result.dailySpotFees.clone(holdersShare), 'Spot Fees')
    dailyRevenue.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

    dailySupplySideRevenue.add(result.dailySpotFees.clone(hlpShare), 'HLP')

    dailyHoldersRevenue.add(result.dailySpotFees.clone(holdersShare), METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
    }
  } else {
    const [result, dailySpotAuctionBurns] = await Promise.all([
      queryHyperliquidIndexer(options),
      queryHypurrscanSpotAuctionBurns(options),
    ]);

    // spot volume
    const dailyVolume = result.dailySpotVolume;

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    // all spot fees
    dailyFees.add(result.dailySpotRevenue, 'Spot Fees')
    dailyFees.add(result.dailyUnitRevenue, 'Spot fees on Unit markets')
    dailyFees.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

    // unit revenue + 1% spot revenue
    dailySupplySideRevenue.add(result.dailySpotRevenue.clone(hlpShare), 'HLP')
    dailySupplySideRevenue.add(result.dailyUnitRevenue, 'Unit Revenue')
    
    // 99% of spot fees
    dailyRevenue.add(result.dailySpotRevenue.clone(holdersShare), 'Spot Fees')
    dailyRevenue.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

    dailyHoldersRevenue.add(result.dailySpotRevenue.clone(holdersShare), METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

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
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2024-12-23',
  methodology,
  breakdownMethodology,
};

export default adapter;