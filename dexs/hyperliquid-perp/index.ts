import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getRevenueRatioShares, LLAMA_HL_INDEXER_FROM_TIME, queryHypurrscanApi } from "../../helpers/hyperliquid";
import { queryHyperliquidIndexerV2 } from "../../helpers/hyperliquid-v2";

const methodology = {
  Volume: "Track trading volume on all perps markets (including HIP-3 markets), excluding all spot markets volume.",
  Fees: "Include perps trading fees on crypto and HIP-3 deployed markets + builders fees, excluding all spot fees.",
  Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding builders fees.",
  ProtocolRevenue: "Protocol doesn't keep any fees.",
  HoldersRevenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding builders fees.",
  SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3% + fees for builders.",
}

const breakdownMethodology = {
  Fees: {
    'Perp Fees': 'Perp trade fees collected as revenue, excluding spot fee.',
    'Builder Code Fees': 'Fees added on top by other platforms building on top of Hyperliquid.',
    'Priority Fees': 'Fees from priority orders paid.',
    'AQAv2 - USDC Yields': 'Hyperliquid gets 90% of cost-adjusted reserve yield revenue from stablecoin deployers',
  },
  Revenue: {
    'Perp Fees': '99% of perp trade fees, excluding spot fees and builders fees.',
    'Priority Fees': 'Fees from priority orders paid.',
    'AQAv2 - USDC Yields': 'Hyperliquid gets 90% of cost-adjusted reserve yield revenue from stablecoin deployers',
  },
  SupplySideRevenue: {
    'Builder Code Distribution': 'All extra fees added on top by builders are fully passed down to these platforms.',
    'HLP': '1% of the perp trade fees go to HLP vault (used to be 3% before 30 Aug 2025)',
    'HIP-3 Deployer Distribution': 'Fees are distributed back to HIP-3 markets deployers.',
    'Maker Rebates': 'Fees are rebated and distributed back to makers.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "99% of perp trade fees (excluding spot fees and builders fees) for buy back HYPE tokens.",
    'HYPE Burn From Priority Fees': 'All prioroty fees will be used to buy and burn HYPE.',
    'AQAv2 - USDC Yields': 'Hyperliquid gets 90% of cost-adjusted reserve yield revenue from stablecoin deployers',
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
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
    dailyRevenue.add(result.dailyPerpFees.clone(holdersShare), 'Perp Fees')
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
    const result = await queryHyperliquidIndexerV2(options);
    const aqav2Interest = result.dailyAqav2Yield;

    // perp volume
    const dailyVolume = result.dailyPerpVolume;

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    // all perp fees
    dailyFees.add(result.dailyPerpFees, 'Perp Fees') // = hyperliquid fees + deployer fees
    dailyFees.add(result.dailyBuildersFees.clone(-1), 'Perp Fees')
    dailyFees.add(result.dailyBuildersFees, 'Builder Code Fees')
    // dailyFees.add(result.dailyPriorityFeesUsd, 'Priority Fees')
    dailyFees.add(aqav2Interest, 'AQAv2 - USDC Yields')

    dailySupplySideRevenue.add(result.dailyHyperliquidRevenue.clone(hlpShare), 'HLP')
    dailySupplySideRevenue.add(result.dailyBuildersFees, 'Builder Code Distribution')
    dailySupplySideRevenue.add(result.dailyPerpDeployersFees, 'HIP-3 Deployer Distribution')
    dailySupplySideRevenue.add(result.dailyMakerRebates, 'Maker Rebates')
    
    // 99% of revenue
    dailyRevenue.add(result.dailyHyperliquidRevenue.clone(holdersShare), 'Perp Fees')
    dailyRevenue.add(aqav2Interest, 'AQAv2 - USDC Yields')
    // dailyRevenue.add(result.dailyPriorityFeesUsd, 'Priority Fees')

    dailyHoldersRevenue.add(result.dailyHyperliquidRevenue.clone(holdersShare), METRIC.TOKEN_BUY_BACK)
    // dailyHoldersRevenue.add(result.dailyPriorityFeesUsd, 'HYPE Burn From Priority Fees')
    dailyHoldersRevenue.add(aqav2Interest, 'AQAv2 - USDC Yields')

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
      // openInterestAtEnd: result.currentPerpOpenInterest,
    }
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2023-06-12',
  methodology,
  breakdownMethodology,
};

export default adapter;
