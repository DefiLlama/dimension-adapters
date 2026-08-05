import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"
import CoreAssets from "../helpers/coreAssets.json"

// Surge Credit: Bitcoin-collateralised USDC lending on Base.
// https://docs.surge.credit/
//
// Fees come entirely from borrow interest. On every state-changing interaction the
// LiquidityPool accrues interest on the outstanding debt and emits ONE event:
//
//   event InterestAccrued(
//     uint256 indexed marketId,
//     uint256 borrowInterest,  // total interest added to the debt this accrual
//     uint256 protocolCut,     // reserve share kept by the protocol (reserveRateBps)
//     uint256 lenderCut        // remainder distributed to USDC LPs
//   )
//
// borrowInterest == protocolCut + lenderCut, all in USDC (1e6). There is no
// origination fee (originationFeeBps == 0 on every market) and no other fee source,
// so borrow interest is the whole of Fees.
const LIQUIDITY_POOL = '0xEE755F1BbcbF6e3260469D0f473522d71d3bdDda'
const USDC = CoreAssets.base.USDC

const InterestAccruedAbi =
  'event InterestAccrued(uint256 indexed marketId, uint256 borrowInterest, uint256 protocolCut, uint256 lenderCut)'

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const interestLogs = await options.getLogs({ target: LIQUIDITY_POOL, eventAbi: InterestAccruedAbi })

  for (const log of interestLogs) {
    dailyFees.add(USDC, log.borrowInterest, METRIC.BORROW_INTEREST)
    dailyRevenue.add(USDC, log.protocolCut, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.add(USDC, log.lenderCut, METRIC.BORROW_INTEREST)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.BASE],
  pullHourly: true,
  fetch,
  start: '2026-03-20',
  methodology: {
    Fees: 'Borrow interest paid by borrowers on Bitcoin-collateralised USDC loans.',
    Revenue: 'Protocol reserve share of borrow interest (reserveRateBps), from the protocolCut field of the InterestAccrued event.',
    ProtocolRevenue: 'Protocol reserve share of borrow interest (reserveRateBps), from the protocolCut field of the InterestAccrued event.',
    SupplySideRevenue: 'Borrow interest distributed to USDC liquidity providers (LPs), from the lenderCut field of the InterestAccrued event.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Gross USDC interest accrued across all markets, from the borrowInterest field of the InterestAccrued event.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve share of borrow interest, from the protocolCut field of the InterestAccrued event.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve share of borrow interest, from the protocolCut field of the InterestAccrued event.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Borrow interest distributed to USDC liquidity providers (LPs), from the lenderCut field of the InterestAccrued event.',
    },
  },
}

export default adapter
