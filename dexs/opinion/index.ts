import { FetchOptions, FetchResult, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const OPINION_CONTRACT = '0x5F45344126D6488025B0b84A3A8189F2487a7246'
const ORDER_FILLED_EVENT =
  'event OrderFilled (bytes32 indexed orderHash,  address indexed maker,address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)'

/**
 * WASH TRADING BLACKLIST
 *
 * Confirmed circular wash trading cluster identified through on-chain analysis.
 *
 * Evidence:
 * - Hub wallet (#1) trades 98%+ of volume with only 4 other wallets (#2,#4,#5,#6)
 * - Partners #5 and #6 trade 99% of their volume exclusively with #1
 * - All wallets bet both YES and NO on same markets (offsetting positions)
 * - Combined wash volume: ~$115M in circular trades
 *
 * These are Gnosis Safe "funder" addresses used on Opinion Protocol.
 */
const WASH_TRADING_BLACKLIST = new Set(
  [
    '0xd006482147f77970ef07a91cd84b532433d57400', // #1 - $54.7M - Hub wallet, trades with #2,#4,#5,#6
    '0xc23395fc42ba0b79c89f2ab942fcd73deeb355f2', // #2 - $21.7M - 85% volume with #1, 11% with #4
    '0xb76ba8797850b2cc2aa3ad7299a008573f28cb9d', // #4 - $19.0M - 84% volume with #1, 13% with #2
    '0x418a3003b9a3e481e2866336fca3007d9474827c', // #5 - $10.1M - 99% volume with #1 (only 2 counterparties)
    '0x6c3326f52f5a251b5504099242a9cdbcc3ab87e7', // #6 - $9.4M  - 99% volume with #1
  ].map((addr) => addr.toLowerCase())
)

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const orderFilledLogs = await options.getLogs({
    eventAbi: ORDER_FILLED_EVENT,
    target: OPINION_CONTRACT,
  })

  orderFilledLogs.forEach((order: any) => {
    const maker = (order.maker || '').toString().toLowerCase()
    const taker = (order.taker || '').toString().toLowerCase()

    if (WASH_TRADING_BLACKLIST.has(maker) || WASH_TRADING_BLACKLIST.has(taker)) {
      return
    }

    const tradeVolume =
      Number(order.makerAssetId == 0 ? order.makerAmountFilled : order.takerAmountFilled) / 1e18
    dailyVolume.addUSDValue(Number(tradeVolume) / 2)
    dailyFees.addUSDValue(Number(order.fee) / 1e18)
  })

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: 'Opinion prediction market trading volume, excluding identified wash trading wallets',
  Fees: 'Taker fees collected by opinion',
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
