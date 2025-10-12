// dimension-adapters/dexs/yield-basis/index.ts
import { CHAIN } from "../../helpers/chains"
import type { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { formatAddress } from "../../utils/utils"
import { addOneToken } from "../../helpers/prices"

const YB_FACTORY = "0x370a449FeBb9411c95bf897021377fe0B7D100c0"

const ABI_market_count = "function market_count() view returns (uint256)"
const ABI_markets =
  "function markets(uint256) view returns (address asset_token, address cryptopool, address amm, address lt, address price_oracle, address virtual_pool, address staker)"
const ABI_coins = "function coins(uint256) view returns (address)"

const ABI_TokenExchange =
  "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 price_scale)"

const fetch = async (opts: FetchOptions) => {
  const dailyVolume = opts.createBalances()

  const count: number = await opts.api.call({ target: YB_FACTORY, abi: ABI_market_count })
  if (!count) return { dailyVolume }

  const markets: any[] = await opts.api.multiCall({
    target: YB_FACTORY,
    abi: ABI_markets,
    calls: Array.from({ length: Number(count) }, (_, i) => ({ params: [i] })),
  })

  const pools = markets
    .map((m) => m?.cryptopool)
    .filter(Boolean)
    .map((p: string) => formatAddress(p))

  if (pools.length === 0) return { dailyVolume }

  const [coins0, coins1] = await Promise.all([
    opts.api.multiCall({ abi: ABI_coins, calls: pools.map((p) => ({ target: p, params: [0] })) }),
    opts.api.multiCall({ abi: ABI_coins, calls: pools.map((p) => ({ target: p, params: [1] })) }),
  ])
  const coinsMap: Record<string, [string, string]> = {}
  pools.forEach((p, i) => {
    coinsMap[p] = [formatAddress(coins0[i]), formatAddress(coins1[i])]
  })

  const logs = await opts.getLogs({
    targets: pools,
    eventAbi: ABI_TokenExchange,
    flatten: true,
    onlyArgs: false,       
  })

  for (const log of logs as any[]) {
    const pool = formatAddress(log.address)
    const soldIdx = Number(log.args.sold_id)
    const boughtIdx = Number(log.args.bought_id)

    const token0 = coinsMap[pool]?.[soldIdx]
    const token1 = coinsMap[pool]?.[boughtIdx]
    if (!token0 || !token1) continue

    const amount0 = Number(log.args.tokens_sold)
    const amount1 = Number(log.args.tokens_bought)

    addOneToken({
      chain: opts.chain,
      balances: dailyVolume,
      token0,
      token1,
      amount0,
      amount1,
    })
  }

  return { dailyVolume }
}

const START = 1758672000 // 2025-09-24T00:00:00Z

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: START,
    },
  },
}

adapter.methodology = {
  Volume:
    "Volume of all spot token swaps that go through the Curve pools managed by Yield Basis",
}

export default adapter
