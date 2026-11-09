import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryAllium } from '../helpers/allium'
import { YOLO_KIND, YOLO_START, assertYoloGuards, yoloEventsCte, yoloGuardsCte } from '../helpers/jupiter-yolo'

const fetch = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options
  const [row] = await queryAllium(`
    WITH ${yoloEventsCte(start, end)}, ${yoloGuardsCte(start, end)}
    SELECT g.unknown_events, g.ingested,
      (SELECT COUNT(DISTINCT owner) FROM yolo_events WHERE kind IN ('${YOLO_KIND.open}', '${YOLO_KIND.close}')) AS users,
      (SELECT COUNT(DISTINCT txn_id) FROM yolo_events WHERE kind IN ('${YOLO_KIND.open}', '${YOLO_KIND.close}')) AS txs
    FROM yolo_guards g
  `)
  assertYoloGuards(row, end)
  return {
    dailyActiveUsers: Number(row.users),
    dailyTransactionsCount: Number(row.txs),
  }
}

const adapter: SimpleAdapter = {
  version: 1, // unique wallets per day cannot be summed from hourly counts
  fetch,
  chains: [CHAIN.SOLANA],
  start: YOLO_START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    ActiveUsers: 'Unique wallets that opened or closed a Jupiter YOLO position that day. Wallets whose only activity was being liquidated are not counted, since liquidations are submitted by Jupiter\'s keeper.',
    TransactionsCount: 'Number of successful open and close transactions submitted by traders that day. Liquidations, which Jupiter\'s keeper submits, are not counted.',
  },
}

export default adapter
