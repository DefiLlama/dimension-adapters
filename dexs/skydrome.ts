import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getUniV2LogAdapter } from '../helpers/uniswap'

// Skydrome: Solidly-style AMM on Scroll with two pair factories (v1 and v2), both from the skydrome TVL adapter
// (DefiLlama-Adapters registries/uniswapV2.js). Pairs emit the stock Uniswap V2 Swap event; verified v1 pair:
// https://sourcify.dev/server/v2/contract/534352/0x1d675222304d1c09370A3922F46B63d6024ea768?fields=all
// Volume only: the swap fee is read per pair from factory.getFee(pair) (0.25% volatile and 0.03% stable on the pairs
// sampled on 2026-11-23) and is sent to the pair's bribe contract only when the pair has a gauge; the v2 factory
// and its pairs are not verified.
// firstPairBlock: PairCreated logs of each factory; windows ending before it skip that factory.
const factories = [
  { factory: '0x2516212168034b18a0155FfbE59f2f0063fFfBD9', firstPairBlock: 4053 }, // v1, first pair 2023-10-11
  { factory: '0x74B8738862E4814C6E6D6e0202F8386685ca7B9D', firstPairBlock: 1806728 }, // v2, first pair 2023-12-22
]

const volumeOnly = ({ dailyVolume }: any) => ({ dailyVolume })

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const toBlock = await options.getToBlock()

  for (const { factory, firstPairBlock } of factories) {
    if (toBlock < firstPairBlock) continue
    const res = await getUniV2LogAdapter({ factory, customLogic: volumeOnly })(options)
    // the helper returns 0 instead of balances when no pair passes its liquidity filter
    if (typeof res.dailyVolume === 'object') dailyVolume.add(res.dailyVolume)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SCROLL],
  start: '2023-10-11',
  methodology: {
    Volume: 'Swap volume on Skydrome pairs on Scroll, from the Swap events of pairs created by the Skydrome v1 and v2 factories.',
  },
}

export default adapter
