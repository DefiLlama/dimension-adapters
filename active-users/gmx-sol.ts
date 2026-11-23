// GMX Solana daily active users, from the GMX Solana squid that fees/gmx-sol and dexs/gmx-sol read.
//
// Active users follow active-users/gmx-v2.ts: wallets that traded or provided GM liquidity that UTC day.
//   - traded: their position changed through a trade (the squid's TradeEvent: opens, increases,
//     decreases, closes and liquidations) or a swap of theirs was executed (SwapExecutedContext).
//     That is the squid's dailyTotalUsers, less one on days with a swap it records with owner "null":
//     those are swaps inside liquidations, whose wallets already count through their TradeEvent, and
//     the "null" is otherwise counted as one more wallet. An order whose execution fails is closed by
//     the keeper without a trade and does not count.
//   - provided GM liquidity: a GM deposit or withdrawal request of theirs was closed that day, executed
//     or cancelled (DepositRemoved, WithdrawalRemoved). gmx-v2 counts the request when it is created;
//     here it counts when it is closed, usually the same minute. GLV-only wallets are left out, as in
//     gmx-v2. GM shifts are not in the squid, so a wallet whose only action was a shift is missed.
// A liquidity provider who also traded that day is counted once.
//
// The squid writes one record per UTC day with no gaps since 2025-02-10, so a missing record means the
// squid has not reached that day yet.
//
// Version 1: the squid publishes daily totals, and unique users cannot be added up from hourly counts.

import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql"

// every row of an entity matching `where`, 1000 per page
const allRows = async (entity: string, where: string, field: string): Promise<any[]> => {
  const rows: any[] = []
  for (let lastId = ''; ;) {
    const { page } = await request(url, gql`
      {
        page: ${entity}(where: {${where}${lastId ? `, id_gt: "${lastId}"` : ''}}, orderBy: id_ASC, limit: 1000) {
          id
          ${field}
        }
      }
    `)
    rows.push(...page)
    if (page.length < 1000) return rows
    lastId = page[page.length - 1].id
  }
}

const fetch = async (options: FetchOptions) => {
  const from = new Date(options.startOfDay * 1000).toISOString()
  const to = new Date((options.startOfDay + 86400) * 1000).toISOString()
  const day = `timestamp_gte: "${from}", timestamp_lt: "${to}"`
  const { userRecordDailies, unattributedSwaps } = await request(url, gql`
    {
      userRecordDailies(where: {id_eq: "${options.dateString}"}) {
        dailyTotalUsers
      }
      unattributedSwaps: swapExecutedContexts(where: {owner_eq: "null", ${day}}, limit: 1) {
        id
      }
    }
  `)
  if (!userRecordDailies.length) throw new Error(`gmx-sol: no daily user record for ${options.dateString} yet`)
  const traders = Number(userRecordDailies[0].dailyTotalUsers) - unattributedSwaps.length

  const liquidityRequests = await Promise.all(['depositRemoveds', 'withdrawalRemoveds'].map((entity) => allRows(entity, day, 'owner')))
  const liquidityProviders = [...new Set(liquidityRequests.flat().map((row) => row.owner))]
  let liquidityOnly = 0
  if (liquidityProviders.length) {
    const wallets = JSON.stringify(liquidityProviders)
    const [trades, swaps] = await Promise.all([
      allRows('tradeEvents', `user_in: ${wallets}, ${day}`, 'user'),
      allRows('swapExecutedContexts', `owner_in: ${wallets}, ${day}`, 'owner'),
    ])
    const alsoTraded = new Set([...trades.map((row) => row.user), ...swaps.map((row) => row.owner)])
    liquidityOnly = liquidityProviders.filter((wallet) => !alsoTraded.has(wallet)).length
  }

  return {
    dailyActiveUsers: traders + liquidityOnly,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-02-12',
  methodology: {
    ActiveUsers: "Unique wallets per day that traded on GMX Solana (a trade changed their position: open, increase, decrease, close or liquidation, or a swap of theirs was executed) or had a GM liquidity deposit or withdrawal request closed. Orders whose execution failed and wallets that only used GLV vaults are not counted.",
  },
}

export default adapter
