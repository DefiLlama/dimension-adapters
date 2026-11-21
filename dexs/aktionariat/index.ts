import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<string, { subgraphId: string; start: string }> = {
  [CHAIN.ETHEREUM]: { subgraphId: '2ZoJCp4S7YP7gbYN2ndsYNjPeZBV1PMti7BBoPRRscNq', start: '2021-06-02' },
  [CHAIN.OPTIMISM]: { subgraphId: '3QfEXbPfP23o3AUzcmjTfRtUUd4bfrFj3cJ4jET57CTX', start: '2022-03-28' },
  [CHAIN.POLYGON]: { subgraphId: '7camBLZckE5TLKha372tqawpDs8Lkez6yYiri7PykRak', start: '2024-01-25' },
}

const PAGE_SIZE = 1000

const swapsQuery = `query swaps($from: BigInt!, $to: BigInt!, $lastId: ID!) {
  _meta { block { timestamp } }
  swaps(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: { timestamp_gte: $from, timestamp_lt: $to, id_gt: $lastId }) {
    id isBuy amountToken amountUSD token { id }
  }
}`

const fetch = async (options: FetchOptions) => {
  const endpoint = sdk.graph.modifyEndpoint(chainConfig[options.chain].subgraphId)
  const swaps: any[] = []
  let lastId = ''
  while (true) {
    const { _meta, swaps: page } = await sdk.graph.request(endpoint, swapsQuery, {
      variables: { from: String(options.startTimestamp), to: String(options.endTimestamp), lastId },
    })
    if (Number(_meta.block.timestamp) < options.endTimestamp)
      throw new Error(`Aktionariat ${options.chain} subgraph is indexed up to ${_meta.block.timestamp}, before window end ${options.endTimestamp}`)
    swaps.push(...page)
    if (page.length < PAGE_SIZE) break
    lastId = page[page.length - 1].id
  }

  const trades = new Map<string, { usd: number; net: number; gross: number; hasBuy: boolean; hasSell: boolean }>()
  for (const swap of swaps) {
    const key = `${swap.id.split('-')[0]}:${swap.token.id}` // swap id = `${txHash}-${logIndex}`
    const trade = trades.get(key) ?? { usd: 0, net: 0, gross: 0, hasBuy: false, hasSell: false }
    const amount = Number(swap.amountToken)
    trade.usd += Number(swap.amountUSD)
    trade.net += swap.isBuy ? amount : -amount
    trade.gross += amount
    if (swap.isBuy) trade.hasBuy = true
    else trade.hasSell = true
    trades.set(key, trade)
  }

  const dailyVolume = options.createBalances()
  for (const trade of trades.values()) {
    if (trade.hasBuy && trade.hasSell && Math.abs(trade.net) <= trade.gross * 1e-9) continue
    dailyVolume.addUSDValue(trade.usd)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "USD value of tokenized company shares bought from and sold to Aktionariat Brokerbots on Ethereum, Optimism and Polygon, as priced by Aktionariat's subgraphs. Excludes zero-fee wash round trips and SecondaryMarket trades.",
  },
}

export default adapter;
