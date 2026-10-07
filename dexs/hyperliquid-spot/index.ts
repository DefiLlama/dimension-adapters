import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import {
  getRevenueRatioShares,
  LLAMA_HL_INDEXER_FROM_TIME,
  queryHypurrscanApi,
  queryHypurrscanSpotAuctionBurns,
} from "../../helpers/hyperliquid";
import { queryHyperliquidIndexerV2 } from "../../helpers/hyperliquid-v2";

const SPOT_DEPLOYMENT_AUCTION_BURNS = "Spot Deployment Auction Burns";

const methodology = {
  Fees: "Include spot trading fees (builder code fees included), unit protocol fees, and HYPE burned in successful HIP-1 token-deployment auctions, excluding perps fees.",
  Revenue: "97% of spot trading fees before 30 Aug 2025 and 99% thereafter, after builder code fees and maker rebates, go to Assistance Fund for buying HYPE tokens, excluding unit protocol fees; HYPE paid in successful HIP-1 token-deployment auctions is burned.",
  ProtocolRevenue: "Protocol doesn't keep any fees.",
  HoldersRevenue: "97% of spot trading fees before 30 Aug 2025 and 99% thereafter, after builder code fees and maker rebates, go to Assistance Fund for buying HYPE tokens, excluding unit protocol fees; HYPE paid in successful HIP-1 token-deployment auctions is permanently burned.",
  SupplySideRevenue: "1% of spot fees after builder code fees and maker rebates go to HLP Vault suppliers (3% before 30 Aug 2025), plus fees for unit protocol, spot builder code fees and spot maker rebates.",
}

const breakdownMethodology = {
  Fees: {
    'Spot Fees': 'Fees collected on all spot trades, excluding trades on markets with Unit assets (eg bridged BTC) and builder code fees.',
    'Spot fees on Unit markets': 'Fees from spot trades on markets that include an asset deployed by Unit, excluding builder code fees, in these spot markets all fees go to Unit.',
    'Builder Code Fees': 'Fees added on top of spot trades by other platforms building on top of Hyperliquid.',
    [SPOT_DEPLOYMENT_AUCTION_BURNS]: 'HYPE paid and permanently burned in successful HIP-1 token-deployment auctions.',
  },
  Revenue: {
    'Spot Fees': '97% of spot trade fees before 30 Aug 2025 and 99% thereafter, after builder code fees and maker rebates, excluding perp fees and unit protocol fees.',
    [SPOT_DEPLOYMENT_AUCTION_BURNS]: 'HIP-1 token-deployment auction payments permanently burned rather than retained or distributed.',
  },
  SupplySideRevenue: {
    'Unit Revenue': 'Fees earned on Unit spot markets go to Unit, after builder code fees paid in Unit assets.',
    'HLP': '1% of the spot fees after builder code fees and maker rebates go to HLP vault (used to be 3% before 30 Aug 2025)',
    'Builder Code Distribution': 'All builder code fees on spot trades are passed down to the platforms that routed them.',
    'Maker Rebates': 'Spot fees rebated and distributed back to makers, all paid by Hyperliquid, including rebates paid in Unit assets.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "97% of spot trade fees before 30 Aug 2025 and 99% thereafter, after builder code fees and maker rebates, excluding perp fees and unit protocol fees, for buying back HYPE tokens.",
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
      queryHyperliquidIndexerV2(options),
      queryHypurrscanSpotAuctionBurns(options),
    ]);

    // spot volume
    const dailyVolume = result.dailySpotVolume;

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    // spot fees include spot builder fees and exclude spot maker rebates. Builder fees are netted within the fee
    // token group they are paid in (Hyperliquid's tokens against Hyperliquid's share, Unit's tokens against Unit's),
    // maker rebates are all paid by Hyperliquid, even when paid in Unit tokens
    const dailyUnitRevenue = result.dailyUnitFees.clone()
    dailyUnitRevenue.add(result.dailyUnitBuildersFees.clone(-1))

    // all spot fees
    dailyFees.add(result.dailySpotFees, 'Spot Fees')
    dailyFees.add(result.dailySpotBuildersFees.clone(-1), 'Spot Fees')
    dailyFees.add(result.dailyUnitFees, 'Spot fees on Unit markets')
    dailyFees.add(result.dailyUnitBuildersFees.clone(-1), 'Spot fees on Unit markets')
    dailyFees.add(result.dailySpotBuildersFees, 'Builder Code Fees')
    dailyFees.add(result.dailyUnitBuildersFees, 'Builder Code Fees')
    dailyFees.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

    // unit revenue + builder fees + maker rebates + 1% spot revenue
    dailySupplySideRevenue.add(result.dailySpotHyperliquidRevenue.clone(hlpShare), 'HLP')
    dailySupplySideRevenue.add(dailyUnitRevenue, 'Unit Revenue')
    dailySupplySideRevenue.add(result.dailySpotBuildersFees, 'Builder Code Distribution')
    dailySupplySideRevenue.add(result.dailyUnitBuildersFees, 'Builder Code Distribution')
    dailySupplySideRevenue.add(result.dailySpotMakerRebates, 'Maker Rebates')

    // 99% of spot fees kept by Hyperliquid
    dailyRevenue.add(result.dailySpotHyperliquidRevenue.clone(holdersShare), 'Spot Fees')
    dailyRevenue.add(dailySpotAuctionBurns, SPOT_DEPLOYMENT_AUCTION_BURNS)

    dailyHoldersRevenue.add(result.dailySpotHyperliquidRevenue.clone(holdersShare), METRIC.TOKEN_BUY_BACK)
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