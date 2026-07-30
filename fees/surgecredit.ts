import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"
import CoreAssets from "../helpers/coreAssets.json"

// Surge Credit: Bitcoin collateralised USDC lending on Base.
// https://docs.surge.credit/
const LIQUIDITY_POOL = '0xEE755F1BbcbF6e3260469D0f473522d71d3bdDda'
const USDC = CoreAssets.base.USDC

const InterestAccruedAbi =
  'event InterestAccrued(uint256 indexed marketId, uint256 interestAccrued, uint256 borrowIndex, uint256 supplyIndex)'

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const interestLogs = await options.getLogs({ target: LIQUIDITY_POOL, eventAbi: InterestAccruedAbi })

  for (const log of interestLogs) {
    dailyFees.add(USDC, log.interestAccrued, METRIC.BORROW_INTEREST)
    dailyRevenue.add(USDC, log.borrowIndex, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.add(USDC, log.supplyIndex, METRIC.BORROW_INTEREST)
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
    Revenue: 'Protocol reserve portion of borrow interest, as emitted by the InterestAccrued event on the LiquidityPool.',
    ProtocolRevenue: 'Protocol reserve portion of borrow interest, as emitted by the InterestAccrued event on the LiquidityPool.',
    SupplySideRevenue: 'Borrow interest distributed to USDC liquidity providers (LPs).',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Gross USDC interest accrued across all markets, read from the interestAccrued field of the InterestAccrued event.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve portion of borrow interest, read from the borrowIndex field of the InterestAccrued event.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve portion of borrow interest, read from the borrowIndex field of the InterestAccrued event.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Borrow interest distributed to USDC liquidity providers (LPs), read from the supplyIndex field of the InterestAccrued event.',
    },
  },
}

export default adapter
