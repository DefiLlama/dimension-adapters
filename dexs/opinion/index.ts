import { FetchOptions, FetchResult, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const OPINION_EXCHANGE_CONTRACT = '0x5F45344126D6488025B0b84A3A8189F2487a7246'
const OPINION_FEE_MANAGER_CONTRACT = '0xC9063Dc52dEEfb518E5b6634A6b8D624bc5d7c36'
const ORDER_FILLED_EVENT = 'event OrderFilled (bytes32 indexed orderHash,  address indexed maker,address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)'
const REBATE_EARNED_EVENT = 'event RebateEarned (address indexed referrer, address indexed trader, address indexed collateralToken, uint256 amount)'

/**
 * WASH TRADING BLACKLIST
 *
 * Confirmed wash trading wallets identified through on-chain analysis.
 *
 * Detection criteria:
 * - ≤2 counterparties with >95% concentration
 * - >80% offsetting positions (betting both YES and NO) with significant volume
 * - Part of circular trading clusters
 * - Wash score ≥95 based on offsetting % and counterparty concentration
 *
 * Analysis dates: Jan 14-15, 19, 22, 24, 2026
 * These are Gnosis Safe "funder" addresses used on Opinion Protocol.
 */
const WASH_TRADING_BLACKLIST = new Set(
  [
    // === Original cluster (identified Oct-Nov 2025) ===
    '0xd006482147f77970ef07a91cd84b532433d57400', // $54.7M - Hub wallet
    '0xc23395fc42ba0b79c89f2ab942fcd73deeb355f2', // $21.7M - 85% volume with hub
    '0xb76ba8797850b2cc2aa3ad7299a008573f28cb9d', // $19.0M - 84% volume with hub
    '0x418a3003b9a3e481e2866336fca3007d9474827c', // $10.1M - 99% volume with hub
    '0x6c3326f52f5a251b5504099242a9cdbcc3ab87e7', // $9.4M - 99% volume with hub

    // === New confirmed wash traders (Jan 2026 analysis) ===
    // High volume wash traders ($5M+)
    '0x72ffa4098788ab41c78da0ed04b4a3eaa4ff9e3d', // $30.2M - 100% offsetting, score 100
    '0x0a7300dbc3fcef290601793bf4395ea0fd38f35c', // $18.7M - 100% offsetting, score 100
    '0x44df52c5c8ffb86da6044b81577f0dd537dec07f', // $5.0M - only 2 CPs, 100% concentration
    '0x015e2b259233ac5c805b14703ef2144dedfc8b01', // $5.0M - only 2 CPs, 82% concentration
  ].map((addr) => addr.toLowerCase())
)

// fees = trade fees - rebate fees
async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances()
  const tradeFees = options.createBalances()
  const rebateFees = options.createBalances()

  const orderFilledLogs = await options.getLogs({
    eventAbi: ORDER_FILLED_EVENT,
    target: OPINION_EXCHANGE_CONTRACT,
  })
  
  const rebateEarnedLogs = await options.getLogs({
    eventAbi: REBATE_EARNED_EVENT,
    target: OPINION_FEE_MANAGER_CONTRACT,
  })

  orderFilledLogs.forEach((order: any) => {
    tradeFees.addUSDValue(Number(order.fee) / 1e18)

    const maker = (order.maker || '').toString().toLowerCase()
    const taker = (order.taker || '').toString().toLowerCase()

    if (WASH_TRADING_BLACKLIST.has(maker) || WASH_TRADING_BLACKLIST.has(taker)) {
      return
    }

    const tradeVolume = Number(order.makerAssetId == 0 ? order.makerAmountFilled : order.takerAmountFilled) / 1e18
    dailyVolume.addUSDValue(Number(tradeVolume) / 2)
  })

  rebateEarnedLogs.forEach((log: any) => {
    rebateFees.addUSDValue(Number(log.amount) / 1e18)
  })
  
  
  const dailyFees = tradeFees.clone(1)
  dailyFees.subtract(rebateFees)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: 'Opinion prediction market trading volume, excluding identified wash trading wallets',
  Fees: 'Taker fees collected by opinion minus rebate earned to traders.',
  Revenue: 'All the fees are revenue',
  ProtocolRevenue: 'All the revenue goes to protocol',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology,
  chains: [CHAIN.BSC],
  start: '2025-10-22',
}

export default adapter
