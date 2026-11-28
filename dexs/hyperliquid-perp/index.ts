// Changes to this adapter's revenue methodology require further approval before merging:
// a Trueo market depends on this data.

import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { CoinGeckoMaps, getRevenueRatioShares, LLAMA_HL_INDEXER_FROM_TIME, queryHypurrscanApi } from "../../helpers/hyperliquid";
import { queryHyperliquidIndexerV2 } from "../../helpers/hyperliquid-v2";
import { postURL } from "../../utils/fetchURL";

const ASSISTANCE_FUND = '0xfefefefefefefefefefefefefefefefefefefefe'
const USDH_DEPLOYER = '0xc4bb9b6fda3112b381cb94f571bc72db541e7577'
const USDH_YIELD_START = Date.UTC(2025, 10, 22) / 1000 // retroactive payment, signed by the deployer
const USDH_YIELD_END = Date.UTC(2026, 3, 11) / 1000 // accrual day of the last automatic payment, 2026-05-26
// the issuer pays daily "on a 45 day backward looking schedule" (usdh.com/contributions)
const USDH_PAYMENT_DELAY = 45 * 24 * 3600

const usdhYieldMethodology = "50% of USDH reserve yield, paid to the Assistance Fund by the USDH deployer (USDH became an aligned quote asset under AQAv1 on 22 Nov 2025). The first payment, 70,001 USDH, is retroactive and is counted on 22 Nov 2025, the day it was paid. The automatic daily payments of 7 Jan to 26 May 2026 are counted 45 days before they were paid, on 23 Nov 2025 to 11 Apr 2026."

const methodology = {
  Volume: "Track trading volume on all perps markets (including HIP-3 markets), excluding all spot markets volume.",
  Fees: "Include perps trading fees on crypto and HIP-3 deployed markets + builders fees, plus Hyperliquid's 90% share of cost-adjusted reserve yield from AQAv2 stablecoin deployers since 27 Aug 2026, plus USDH reserve yield paid to the Assistance Fund, counted from 22 Nov 2025 to 11 Apr 2026 (see AQAv1 - USDH Yields in the breakdown), plus HYPE order priority fees since 13 Apr 2026 and gossip priority fees since 20 Apr 2026 (network-level, not specific to perps), excluding all spot fees.",
  Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding builders fees, plus Hyperliquid's 90% share of AQAv2 stablecoin reserve yield since 27 Aug 2026, plus USDH reserve yield paid to the Assistance Fund, counted from 22 Nov 2025 to 11 Apr 2026 (see AQAv1 - USDH Yields in the breakdown), plus all priority fees, which are burned.",
  ProtocolRevenue: "Protocol doesn't keep any fees.",
  HoldersRevenue: "99% of fees go to Assistance Fund for buying HYPE tokens, excluding builders fees, plus Hyperliquid's 90% share of AQAv2 stablecoin reserve yield since 27 Aug 2026, plus USDH reserve yield paid to the Assistance Fund, counted from 22 Nov 2025 to 11 Apr 2026 (see AQAv1 - USDH Yields in the breakdown), plus all priority fees, which are burned.",
  SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3% + fees for builders.",
}

const breakdownMethodology = {
  Fees: {
    'Perp Fees': 'Perp trade fees collected as revenue, excluding spot fee.',
    'Builder Code Fees': 'Fees added on top by other platforms building on top of Hyperliquid.',
    'Order Priority Fees': 'HYPE paid by IOC orders for write priority, almost all on perps (HIP-3 included).',
    'Gossip Priority Fees': 'HYPE paid in auctions for node data read priority. Network-level, not tied to perps or any market.',
    'AQAv2 - USDC Yields': 'Hyperliquid gets 90% of cost-adjusted reserve yield revenue from stablecoin deployers',
    'AQAv1 - USDH Yields': usdhYieldMethodology,
  },
  Revenue: {
    'Perp Fees': '99% of perp trade fees, excluding spot fees and builders fees.',
    'Order Priority Fees': 'All order priority fees, burned.',
    'Gossip Priority Fees': 'All gossip priority fees, burned.',
    'AQAv2 - USDC Yields': 'Hyperliquid gets 90% of cost-adjusted reserve yield revenue from stablecoin deployers',
    'AQAv1 - USDH Yields': usdhYieldMethodology,
  },
  SupplySideRevenue: {
    'Builder Code Distribution': 'All extra fees added on top by builders are fully passed down to these platforms.',
    'HLP': '1% of the perp trade fees go to HLP vault (used to be 3% before 30 Aug 2025)',
    'HIP-3 Deployer Distribution': 'Fees are distributed back to HIP-3 markets deployers.',
    'Maker Rebates': 'Fees are rebated and distributed back to makers.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "99% of perp trade fees (excluding spot fees and builders fees) for buy back HYPE tokens.",
    'HYPE Burn From Order Priority Fees': 'All order priority fees are paid in HYPE and burned.',
    'HYPE Burn From Gossip Priority Fees': 'All gossip priority fees are paid in HYPE and burned.',
    'AQAv2 - USDC Yields': 'Hyperliquid gets 90% of cost-adjusted reserve yield revenue from stablecoin deployers',
    'AQAv1 - USDH Yields': usdhYieldMethodology,
  },
}

// USDH reserve yield (AQAv1) paid by the USDH deployer to the Assistance Fund, read from the HyperCore ledger
async function getUsdhYield(options: FetchOptions) {
  const dailyYield = options.createBalances()
  if (options.startOfDay < USDH_YIELD_START || options.startOfDay > USDH_YIELD_END) return dailyYield

  // the 22 Nov 2025 payment has no published accrual days, so it counts on the day it was paid;
  // the automatic payments (nonce 0) count 45 days before they were paid
  const retroactive = options.startOfDay === USDH_YIELD_START
  const startTime = (options.startOfDay + (retroactive ? 0 : USDH_PAYMENT_DELAY)) * 1000
  const ledger = await postURL("https://api.hyperliquid.xyz/info", {
    type: "userNonFundingLedgerUpdates", user: USDH_DEPLOYER, startTime, endTime: startTime + 24 * 3600 * 1000 - 1,
  })
  if (!Array.isArray(ledger)) throw new Error("hyperliquid: USDH deployer ledger is not an array")

  const payments = ledger.map((entry: any) => entry.delta).filter((delta: any) =>
    delta.destination === ASSISTANCE_FUND && delta.token === 'USDH' &&
    (retroactive ? delta.type === 'spotTransfer' : delta.type === 'send' && delta.nonce === 0))
  if (!payments.length) throw new Error(`hyperliquid: no USDH yield payment found for ${options.dateString}`)
  payments.forEach((delta: any) => dailyYield.addCGToken(CoinGeckoMaps.USDH, Number(delta.amount)))
  return dailyYield
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
    const usdhYield = await getUsdhYield(options);

    // perp volume
    const dailyVolume = result.dailyPerpVolume;

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()

    // all perp fees, perp builder fees and rebates only: spot and outcome ones are netted in their own listings
    dailyFees.add(result.dailyPerpFees, 'Perp Fees') // = hyperliquid fees + deployer fees + perp builder fees
    dailyFees.add(result.dailyPerpBuildersFees.clone(-1), 'Perp Fees')
    dailyFees.add(result.dailyPerpBuildersFees, 'Builder Code Fees')
    dailyFees.add(aqav2Interest, 'AQAv2 - USDC Yields')
    dailyFees.add(usdhYield, 'AQAv1 - USDH Yields')

    dailySupplySideRevenue.add(result.dailyHyperliquidRevenue.clone(hlpShare), 'HLP')
    dailySupplySideRevenue.add(result.dailyPerpBuildersFees, 'Builder Code Distribution')
    dailySupplySideRevenue.add(result.dailyPerpDeployersFees, 'HIP-3 Deployer Distribution')
    dailySupplySideRevenue.add(result.dailyPerpMakerRebates, 'Maker Rebates')
    
    // 99% of revenue
    dailyRevenue.add(result.dailyHyperliquidRevenue.clone(holdersShare), 'Perp Fees')
    dailyRevenue.add(aqav2Interest, 'AQAv2 - USDC Yields')
    dailyRevenue.add(usdhYield, 'AQAv1 - USDH Yields')

    dailyHoldersRevenue.add(result.dailyHyperliquidRevenue.clone(holdersShare), METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(aqav2Interest, 'AQAv2 - USDC Yields')
    dailyHoldersRevenue.add(usdhYield, 'AQAv1 - USDH Yields')

    // priority fees, all burned
    if (result.dailyWritePriorityFees) {
      dailyFees.add(result.dailyWritePriorityFees, 'Order Priority Fees')
      dailyRevenue.add(result.dailyWritePriorityFees, 'Order Priority Fees')
      dailyHoldersRevenue.add(result.dailyWritePriorityFees, 'HYPE Burn From Order Priority Fees')
    }
    // gossip priority buys node data read priority, network-level and not tied to perps or any market
    if (result.dailyReadPriorityFees) {
      dailyFees.add(result.dailyReadPriorityFees, 'Gossip Priority Fees')
      dailyRevenue.add(result.dailyReadPriorityFees, 'Gossip Priority Fees')
      dailyHoldersRevenue.add(result.dailyReadPriorityFees, 'HYPE Burn From Gossip Priority Fees')
    }
    
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
  note: "Changes to this adapter's revenue methodology require further approval before merging: a Trueo market depends on this data.",
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2023-06-12',
  methodology,
  breakdownMethodology,
};

export default adapter;
