import { request, gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";

// AaroTrade's own indexer (Ponder), backing https://aarotrade.com - INDEXER_URL in its frontend bundle.
// One `trade` row per swap on a launched token's Uniswap V3 pool; `ethAmount` is the ETH side
// of that swap, used here as trade notional volume.
const INDEXER_URL = 'https://indexer-production-6ea6.up.railway.app/graphql'

// Ponder's GraphQL API caps `limit` at 1000 rows per page (requests above that are rejected).
const PAGE_SIZE = 1000

const query = gql`
  query Trades($start: BigInt!, $end: BigInt!, $after: String) {
    trades(where: { timestamp_gte: $start, timestamp_lte: $end }, limit: ${PAGE_SIZE}, after: $after) {
      items { ethAmount }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  let after: string | undefined = undefined
  while (true) {
    const res: any = await request(INDEXER_URL, query, {
      start: String(options.startTimestamp),
      end: String(options.endTimestamp),
      after,
    })
    for (const trade of res.trades.items) {
      dailyVolume.addGasToken(trade.ethAmount)
    }
    if (!res.trades.pageInfo.hasNextPage) break
    after = res.trades.pageInfo.endCursor
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-10',
  methodology: {
    Volume: 'Notional ETH volume of swaps on Uniswap V3 pools for tokens launched via AaroTrade.',
  },
}

export default adapter;
