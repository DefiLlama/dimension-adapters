import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"
import CoreAssets from "../helpers/coreAssets.json"

// Surge Credit: Bitcoin collateralised USDC lending on Base.
// https://docs.surge.credit/
const LIQUIDITY_POOL = '0xEE755F1BbcbF6e3260469D0f473522d71d3bdDda'
const USDC = CoreAssets.base.USDC

const InterestAccruedAbi =
  'event InterestAccrued(uint256 indexed marketId, uint256 totalInterest, uint256 protocolFee, uint256 supplierRevenue)'

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({
    target: LIQUIDITY_POOL,
    eventAbi: InterestAccruedAbi,
  })

  for (const log of logs) {
    dailyFees.add(USDC, log.totalInterest, METRIC.BORROW_INTEREST)
    dailyRevenue.add(USDC, log.protocolFee, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.add(USDC, log.supplierRevenue, METRIC.BORROW_INTEREST)
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
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  start: '2026-03-20',
  methodology: {
    Fees: 'Total interest paid by borrowers on USDC credit lines collateralised by Bitcoin.',
    Revenue: 'Protocol reserve portion of borrow interest, as emitted by the InterestAccrued event on the LiquidityPool.',
    ProtocolRevenue: 'Protocol reserve portion of borrow interest, as emitted by the InterestAccrued event on the LiquidityPool.',
    SupplySideRevenue: 'Portion of borrow interest distributed to USDC liquidity providers, as emitted by the InterestAccrued event on the LiquidityPool.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Gross USDC interest charged to borrowers, read from the totalInterest field of the InterestAccrued event.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve portion of borrow interest, read from the protocolFee field of the InterestAccrued event.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve portion of borrow interest, read from the protocolFee field of the InterestAccrued event.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'LP portion of borrow interest, read from the supplierRevenue field of the InterestAccrued event.',
    },
  },
}

export default adapter
