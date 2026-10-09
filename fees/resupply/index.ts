import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

const reUSD = "0x57aB1E0003F623289CD798B1824Be09a793e4Bec"
const feeDepositController = "0x7E3D2F480AbbA95863040D763DDe8F30D100C6F5"
const registryAddress = "0x10101010E0C3171D894B71B3400668aF311e7D94"

const abi = {
  addInterest: "event AddInterest(uint256 interestEarned, uint256 rate)",
  redeemed: "event Redeemed(address indexed _caller, uint256 _amount, uint256 _collateralFreed, uint256 _protocolFee, uint256 _debtReduction)",
  borrow: "event Borrow(address indexed _borrower, address indexed _receiver, uint256 _borrowAmount, uint256 _sharesAdded, uint256 _mintFees)",
  splits: "function splits() external view returns (tuple(uint80 insurance, uint80 treasury, uint80 platform))"
}

// Basis point denominator (10,000 bps = 100%) defined in FeeDepositController.BPS
const BPS_DENOMINATOR = 10000

// The pair list is cached for the process lifetime to minimize redundant RPC calls during hourly evaluations.
// Newly deployed pairs during a running process are not picked up, and historical backfills use the current list
// (which relies on getLogs tolerating targets that did not yet exist at historical blocks).
let cachedPairs: string[] = []

/**
 * Fetches the daily fees, revenue, supply-side revenue, protocol revenue, and holders revenue for ReSupply.
 * ReSupply is a CDP lending market where pairs emit AddInterest (borrow interest), Borrow (mint fees),
 * and Redeemed (protocol redemption fees) in reUSD.
 * Fees are distributed via FeeDepositController based on dynamic on-chain splits (currently 25% insurance,
 * 5% treasury, 70% platform stakers):
 * - insurance: distributed to insurance pool depositors / lenders (SupplySideRevenue)
 * - treasury: retained by DAO treasury (ProtocolRevenue)
 * - platform: distributed to RSUP governance token stakers (HoldersRevenue)
 * @param options - FetchOptions provided by the DefiLlama SDK
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  if (cachedPairs.length === 0) {
    cachedPairs = await options.api.call({
      abi: 'address[]:getAllPairAddresses',
      target: registryAddress,
    })
  }

  const [splits, addInterestLogs, redeemedLogs, borrowLogs] = await Promise.all([
    options.api.call({ target: feeDepositController, abi: abi.splits }),
    options.getLogs({ targets: cachedPairs as any, eventAbi: abi.addInterest }),
    options.getLogs({ targets: cachedPairs as any, eventAbi: abi.redeemed }),
    options.getLogs({ targets: cachedPairs as any, eventAbi: abi.borrow }),
  ])

  addInterestLogs.forEach((log) => dailyFees.add(reUSD, log.interestEarned, METRIC.BORROW_INTEREST))
  redeemedLogs.forEach((log) => dailyFees.add(reUSD, log._protocolFee, METRIC.MINT_REDEEM_FEES))
  borrowLogs.forEach((log) => dailyFees.add(reUSD, log._mintFees, METRIC.MINT_REDEEM_FEES))

  const insuranceBps = Number(splits.insurance)
  const treasuryBps = Number(splits.treasury)
  const platformBps = Number(splits.platform)
  const totalBps = insuranceBps + treasuryBps + platformBps

  if (totalBps === 0) {
    throw new Error('FeeDepositController splits sum to 0')
  }

  // Derive ratios normalized to totalBps, guaranteeing supplySide + revenue strictly equals dailyFees
  const treasuryRatio = treasuryBps / totalBps
  const platformRatio = platformBps / totalBps
  const revenueRatio = (treasuryBps + platformBps) / totalBps
  const insuranceRatio = 1 - revenueRatio

  const dailyRevenue = dailyFees.clone(revenueRatio)
  const dailySupplySideRevenue = dailyFees.clone(insuranceRatio)
  const dailyHoldersRevenue = dailyFees.clone(platformRatio)
  const dailyProtocolRevenue = dailyFees.clone(treasuryRatio)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: "Total interest paid by borrowers, borrow mint fees, and collateral redemption fees.",
  Revenue: "Protocol and platform share of fees distributed to the DAO treasury and RSUP stakers.",
  ProtocolRevenue: "Portion of protocol fees allocated to the DAO treasury based on on-chain splits.",
  HoldersRevenue: "Portion of protocol fees distributed as staking rewards to RSUP stakers based on on-chain splits.",
  SupplySideRevenue: "Portion of protocol fees allocated to the insurance pool for lenders and depositors based on on-chain splits.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest accrued and paid by borrowers across all active pairs.",
    [METRIC.MINT_REDEEM_FEES]: "Mint fees incurred on borrow and protocol fees charged on collateral redemptions.",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Combined DAO treasury and RSUP staking share of borrow interest.",
    [METRIC.MINT_REDEEM_FEES]: "Combined DAO treasury and RSUP staking share of mint and redemption fees.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Insurance pool share of borrow interest distributed to lenders and depositors.",
    [METRIC.MINT_REDEEM_FEES]: "Insurance pool share of mint and redemption fees distributed to lenders and depositors.",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "DAO treasury share of borrow interest based on on-chain splits.",
    [METRIC.MINT_REDEEM_FEES]: "DAO treasury share of mint and redemption fees based on on-chain splits.",
  },
  HoldersRevenue: {
    [METRIC.BORROW_INTEREST]: "Staking rewards from borrow interest distributed to RSUP stakers based on on-chain splits.",
    [METRIC.MINT_REDEEM_FEES]: "Staking rewards from mint and redemption fees distributed to RSUP stakers based on on-chain splits.",
  },
}

const adapters: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2025-03-13',
    },
  },
  methodology,
  breakdownMethodology,
  version: 2,
  pullHourly: true,
}

export default adapters;