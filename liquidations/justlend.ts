import ADDRESSES from '../helpers/coreAssets.json'
import * as sdk from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { fetchURLAutoHandleRateLimit } from '../utils/fetchURL'

// JustLend is a Compound V2 fork. The repaid jToken emits
// LiquidateBorrow(liquidator, borrower, repayAmount, cTokenCollateral, seizeTokens).
// seizeTokens is in collateral jToken.
const comptroller = 'TGjYzgCyPobsNS9n6WcbdLVR9dH7mWqFx7'
const jTRX = 'TE2RzoSV3wFK99w6J9UnnZ4vLfXYoxvRwP'
const endpoint = 'https://api.trongrid.io'

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
    if (!fingerprint || !data.length) return events
    await delay(2500)
  }
  throw new Error(`justlend: more than 200 pages of LiquidateBorrow events on ${market}`)
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const api = new sdk.ChainApi({ chain: options.chain })
  const markets: string[] = (await api.call({ abi: 'address[]:getAllMarkets', target: comptroller })).map(sdk.tron.unhexifyTarget)
  const liquidationIncentive = BigInt(await api.call({ abi: 'uint256:liquidationIncentiveMantissa', target: comptroller }))
  const tokenMarkets = markets.filter(m => m !== jTRX)
  const underlyings: string[] = await api.multiCall({ abi: 'address:underlying', calls: tokenMarkets })

  // max_block_timestamp is inclusive, stop 1ms short so a block on the boundary is not counted in two windows
  const minTimestampMs = options.fromTimestamp * 1000
  const maxTimestampMs = options.toTimestamp * 1000 - 1
  for (const market of markets) {
    const underlying = market === jTRX ? ADDRESSES.tron.WTRX : sdk.tron.unhexifyTarget(underlyings[tokenMarkets.indexOf(market)])
    const events = await getLiquidations(market, minTimestampMs, maxTimestampMs)
    for (const { result } of events)
      dailyCollateralLiquidated.add(underlying, (BigInt(result.repayAmount) * liquidationIncentive) / BigInt(1e18))
    await delay(2500)
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TRON],
  start: '2020-12-08',
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in JustLend liquidations, valued as the debt repaid by the liquidator plus the 8% liquidation incentive.',
  },
}

export default adapter
