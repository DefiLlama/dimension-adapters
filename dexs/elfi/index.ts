import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const contracts: Record<string, string> = {
  [CHAIN.ARBITRUM]: '0x153c613D572c050104086c7113d00B76Fbaa5d55',
  [CHAIN.BASE]: '0x957e0C2Ea128b0307B5730ff83e0bA508b729d50',
}

// OrderFilled-like event with OrderInfo + fillQty + fillTime + fillPrice (topic0)
const ORDER_FILLED_TOPIC = '0x27cd10c59ec617eb0cc015b5900117fef098349140a09083205d2a32afe025bb'

const fetch = async ({
  getLogs,
  chain,
  createBalances,
  getFromBlock,
  getToBlock,
}: FetchOptions) => {
  const dailyVolume = createBalances()
  const fromBlock = await getFromBlock()
  const toBlock = await getToBlock()

  const logs = await getLogs({
    target: contracts[chain],
    topics: [ORDER_FILLED_TOPIC],
    fromBlock,
    toBlock,
    entireLog: true,
  })

  logs.forEach((log: any) => {
    const data = (log.data || '').replace('0x', '')
    if (data.length < 20 * 64) return

    // Data layout: OrderInfo (17 words) + fillQty + fillTime + fillPrice
    const qty = BigInt(`0x${data.slice(9 * 64, 10 * 64)}`) // order.qty in 1e18 USD
    const fillQty = BigInt(`0x${data.slice(17 * 64, 18 * 64)}`) // fillQty in 1e18 USD
    const volume = fillQty > 0n ? fillQty : qty
    if (volume === 0n) return

    // Convert from 1e18 to USD with bigint-safe scaling (keep 6 decimals)
    const volumeUsd = Number(volume / 10n ** 12n) / 1e6
    dailyVolume.addCGToken('tether', volumeUsd)
  })

  return {
    dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-07-18',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-10-01',
    },
  },
}

export default adapter
