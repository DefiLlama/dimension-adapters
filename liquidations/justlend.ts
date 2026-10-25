import ADDRESSES from '../helpers/coreAssets.json'
import * as sdk from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { fetchURLAutoHandleRateLimit } from '../utils/fetchURL'

// JustLend is a Compound V2 fork. The repaid jToken emits
// LiquidateBorrow(liquidator, borrower, repayAmount, cTokenCollateral, seizeTokens),
// seizeTokens being in units of the collateral jToken.
const comptroller = 'TGjYzgCyPobsNS9n6WcbdLVR9dH7mWqFx7'
const jTRX = 'TE2RzoSV3wFK99w6J9UnnZ4vLfXYoxvRwP'
const endpoint = 'https://api.trongrid.io'

const { tronToEvmAddress } = sdk.util
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// TronGrid caps a response at 200 events, page with the fingerprint cursor (same as fees/justlend)
const getLiquidations = async (market: string, minTimestampMs: number, maxTimestampMs: number) => {
  let events: any[] = []
  let fingerprint: string | undefined = undefined
  for (let page = 0; page < 200; page++) {
    const params = [
      'event_name=LiquidateBorrow',
      `min_block_timestamp=${minTimestampMs}`,
      `max_block_timestamp=${maxTimestampMs}`,
      'order_by=block_timestamp,asc',
      'limit=200',
    ]
    if (fingerprint) params.push(`fingerprint=${fingerprint}`)
    const res = await fetchURLAutoHandleRateLimit(`${endpoint}/v1/contracts/${market}/events?${params.join('&')}`)
    const data = res.data ?? []
    events = events.concat(data)
    fingerprint = res.meta?.fingerprint
    if (!fingerprint || !data.length) break
    await delay(2500)
  }
  return events
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  // Tron RPCs only answer calls at the latest block, so options.api (pinned to the window) cannot be used,
  // and seized jTokens are converted at today's exchange rate
  const api = new sdk.ChainApi({ chain: options.chain })
  const markets: string[] = (await api.call({ abi: 'address[]:getAllMarkets', target: comptroller })).map(sdk.tron.unhexifyTarget)
  const tokenMarkets = markets.filter(m => m !== jTRX)
  const [underlyings, exchangeRates] = await Promise.all([
    api.multiCall({ abi: 'address:underlying', calls: tokenMarkets }),
    api.multiCall({ abi: 'uint256:exchangeRateStored', calls: markets }),
  ])

  const collateral: Record<string, { underlying: string, exchangeRate: bigint }> = {}
  markets.forEach((market, i) => {
    const underlying = market === jTRX ? ADDRESSES.tron.WTRX : sdk.tron.unhexifyTarget(underlyings[tokenMarkets.indexOf(market)])
    collateral[tronToEvmAddress(market).toLowerCase()] = { underlying, exchangeRate: BigInt(exchangeRates[i]) }
  })

  // max_block_timestamp is inclusive, stop 1ms short so a block on the boundary is not counted in two windows
  const minTimestampMs = options.fromTimestamp * 1000
  const maxTimestampMs = options.toTimestamp * 1000 - 1
  for (const market of markets) {
    const events = await getLiquidations(market, minTimestampMs, maxTimestampMs)
    for (const { result } of events) {
      const seized = collateral[result.cTokenCollateral.toLowerCase()]
      if (!seized) throw new Error(`justlend: unknown collateral jToken ${result.cTokenCollateral}`)
      // exchangeRateStored is scaled by 1e18
      dailyCollateralLiquidated.add(seized.underlying, (BigInt(result.seizeTokens) * seized.exchangeRate) / BigInt(1e18))
    }
    await delay(2500)
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TRON],
  start: '2023-11-19',
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in JustLend LiquidateBorrow events, converted from jToken units to the underlying with exchangeRateStored.',
  },
}

export default adapter
