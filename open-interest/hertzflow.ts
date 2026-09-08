import { AbiCoder, keccak256 } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// BSC mainnet DataStore: https://bscscan.com/address/0xc244A37A17CE7aa14E1BDD73f6a047Ed6B56f6B8
const DATA_STORE = '0xc244A37A17CE7aa14E1BDD73f6a047Ed6B56f6B8'
// BSC mainnet Reader: https://bscscan.com/address/0xFC370bA161F4B54B12574c7e0a2121Cea57854A1
const READER = '0xFC370bA161F4B54B12574c7e0a2121Cea57854A1'
// Upper bound for Reader pagination; the current deployment has four markets.
const MAX_MARKETS = 1000
// GMX v2-compatible USD values use 30-decimal fixed-point precision:
// https://github.com/gmx-io/gmx-synthetics/blob/main/contracts/utils/Precision.sol#L23
const USD_DECIMALS = 30
const USD_PRECISION = 10n ** BigInt(USD_DECIMALS)

const GET_MARKETS_ABI = 'function getMarkets(address dataStore, uint256 start, uint256 end) view returns (tuple(address marketToken, address indexToken, address longToken, address shortToken)[])'
const GET_UINT_ABI = 'function getUint(bytes32 key) view returns (uint256)'
const coder = AbiCoder.defaultAbiCoder()
const OPEN_INTEREST = keccak256(coder.encode(['string'], ['OPEN_INTEREST']))

function openInterestKey(market: string, collateralToken: string, isLong: boolean): string {
  return keccak256(
    coder.encode(
      ['bytes32', 'address', 'address', 'bool'],
      [OPEN_INTEREST, market, collateralToken, isLong],
    ),
  )
}

function usd30(amount: bigint): string {
  const fraction = (amount % USD_PRECISION).toString().padStart(USD_DECIMALS, '0').replace(/0+$/, '')
  return `${amount / USD_PRECISION}${fraction ? `.${fraction}` : ''}`
}

const fetch = async (options: FetchOptions) => {
  const markets: any[] = await options.api.call({
    target: READER,
    abi: GET_MARKETS_ABI,
    params: [DATA_STORE, 0, MAX_MARKETS],
  })

  const calls: { params: [string]; isLong: boolean }[] = []
  for (const market of markets) {
    const marketToken = market.marketToken ?? market[0]
    const longToken = market.longToken ?? market[2]
    const shortToken = market.shortToken ?? market[3]

    for (const collateralToken of new Set<string>([longToken, shortToken])) {
      calls.push({ params: [openInterestKey(marketToken, collateralToken, true)], isLong: true })
      calls.push({ params: [openInterestKey(marketToken, collateralToken, false)], isLong: false })
    }
  }

  const values = await options.api.multiCall({
    target: DATA_STORE,
    abi: GET_UINT_ABI,
    calls,
  })

  let longOpenInterest = 0n
  let shortOpenInterest = 0n
  values.forEach((item: any, index: number) => {
    const amount = BigInt(item.toString())
    if (calls[index].isLong) longOpenInterest += amount
    else shortOpenInterest += amount
  })

  return {
    openInterestAtEnd: usd30(longOpenInterest + shortOpenInterest),
    longOpenInterestAtEnd: usd30(longOpenInterest),
    shortOpenInterestAtEnd: usd30(shortOpenInterest),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // OI is a snapshot; hourly records would be summed into the daily value
  chains: [CHAIN.BSC],
  start: '2026-08-14',
  fetch,
  methodology: {
    OpenInterest: 'Current long and short notional open interest in USD across every HertzFlow market and supported collateral token, read from the latest DataStore state.',
  },
}

export default adapter
