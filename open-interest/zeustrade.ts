import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { EVENTS, VAULT, VAULT_START_BLOCK, usd30 } from '../helpers/zeustrade'

// The GMX v1 Vault keeps the total short size per token (globalShortSizes) but no
// total long size, so open interest is rebuilt from every position event since
// the Vault was created: increases add size, decreases and liquidations remove it.
const fetch = async (options: FetchOptions) => {
  const query = { target: VAULT, fromBlock: VAULT_START_BLOCK }
  const increases = await options.getLogs({ ...query, eventAbi: EVENTS.increasePosition })
  const decreases = await options.getLogs({ ...query, eventAbi: EVENTS.decreasePosition })
  const liquidations = await options.getLogs({ ...query, eventAbi: EVENTS.liquidatePosition })

  const sizes = new Map<string, { indexToken: string; isLong: boolean; size: bigint }>()
  const change = (indexToken: string, isLong: boolean, delta: bigint) => {
    const key = `${indexToken.toLowerCase()}-${isLong}`
    const entry = sizes.get(key) ?? { indexToken, isLong, size: 0n }
    entry.size += delta
    sizes.set(key, entry)
  }
  increases.forEach((log: any) => change(log.indexToken, log.isLong, BigInt(log.sizeDelta)))
  decreases.forEach((log: any) => change(log.indexToken, log.isLong, -BigInt(log.sizeDelta)))
  liquidations.forEach((log: any) => change(log.indexToken, log.isLong, -BigInt(log.size)))

  const openInterestAtEnd = options.createBalances()
  const longOpenInterestAtEnd = options.createBalances()
  const shortOpenInterestAtEnd = options.createBalances()
  for (const { indexToken, isLong, size } of sizes.values()) {
    if (size < 0n) throw new Error(`ZEUS open interest below zero for ${indexToken} isLong=${isLong}`)
    if (size === 0n) continue
    // Every position faces the shared pool, so long plus short counts each position once.
    openInterestAtEnd.addUSDValue(usd30(size))
    if (isLong) longOpenInterestAtEnd.addUSDValue(usd30(size))
    else shortOpenInterestAtEnd.addUSDValue(usd30(size))
  }

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // OI is a snapshot at the window end; hourly snapshots must not be summed
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-05-05',
  methodology: {
    OpenInterest: 'Size of all positions open at the end of the period on crypto and US stock markets, long plus short, in USD at entry like the Vault globalShortSizes. Rebuilt from the Vault IncreasePosition, DecreasePosition and LiquidatePosition events since the Vault was created; long and short OI are the two sides of the same total.',
  },
}

export default adapter
