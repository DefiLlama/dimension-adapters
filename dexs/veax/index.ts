import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

export const VEAX = 'veax.near'

export const MAJOR_TOKENS: Record<string, { cgId: string; decimals: number }> = {
  'wrap.near': { cgId: 'near', decimals: 24 }, // wNEAR
  'usdt.tether-token.near': { cgId: 'tether', decimals: 6 }, // native USDt
  '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { cgId: 'usd-coin', decimals: 6 }, // native USDC
  'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near': { cgId: 'tether', decimals: 6 }, // Rainbow Bridge USDT.e (Ethereum 0xdac17f...)
  'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near': { cgId: 'usd-coin', decimals: 6 }, // Rainbow Bridge USDC.e (Ethereum 0xa0b869...)
  'aurora': { cgId: 'ethereum', decimals: 18 }, // Rainbow Bridge ETH
  '2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near': { cgId: 'wrapped-bitcoin', decimals: 8 }, // Rainbow Bridge WBTC
  'nbtc.bridge.near': { cgId: 'bitcoin', decimals: 8 }, // nBTC (Omni Bridge BTC)
  'meta-pool.near': { cgId: 'staked-near', decimals: 24 }, // stNEAR
}

// 2026-10-31 04:04 UTC exploit: this account opened pools against its own worthless tokens and swapped them for
// ~11.9k wNEAR, 2.26k USDt and meme tokens held by the other pools (txs Epjjnp38gsr9PC7ByT3pHz1qMzD3EGPJFexgqyi1Fztf,
// 6QZLeRhqggX5BcohMNgJTi5rx3x2amz2yDuAnsFqwXNo, BQkmuByxyoovFknaHCPjDFBWtXm3FkLSsNg6FS7e4vbV)
export const EXCLUDED_USERS = ['realkingdom9695.near']

export const sqlList = (items: string[]) => items.map((i) => `'${i}'`).join(', ')

// NEAR events land on Allium ~40 min late: a quiet window only counts once later events are there
export const indexedCheckSql = (options: FetchOptions) => `
  SELECT EXISTS (SELECT 1 FROM near.raw.event_logs
    WHERE transaction_block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND transaction_block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed`

export const assertIndexed = (row: any, options: FetchOptions) => {
  if (!row?.indexed)
    throw new Error(`veax: Allium has not indexed NEAR past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`)
}

const fetch = async (options: FetchOptions) => {
  const majors = sqlList(Object.keys(MAJOR_TOKENS))
  const rows = await queryAllium(`
    WITH swaps AS (
      SELECT event_data:tokens[0]::STRING AS token_in, event_data:tokens[1]::STRING AS token_out,
        event_data:amounts[0]::STRING AS amount_in, event_data:amounts[1]::STRING AS amount_out
      FROM near.raw.event_logs
      WHERE executor_id = '${VEAX}' AND event_standard = 'veax' AND event_name = 'swap'
        -- a receipt that panics (slippage, gas) keeps its logs but its swap is rolled back
        AND success
        AND event_data:user::STRING NOT IN (${sqlList(EXCLUDED_USERS)})
        AND transaction_block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND transaction_block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    volumes AS (
      SELECT IFF(token_in IN (${majors}), token_in, token_out) AS token,
        SUM(TO_NUMBER(IFF(token_in IN (${majors}), amount_in, amount_out)))::VARCHAR AS amount
      FROM swaps
      WHERE token_in IN (${majors}) OR token_out IN (${majors})
      GROUP BY 1
    ),
    checks AS (${indexedCheckSql(options)})
    SELECT checks.indexed, volumes.token, volumes.amount
    FROM checks LEFT JOIN volumes ON TRUE
  `)
  assertIndexed(rows[0], options)

  const dailyVolume = options.createBalances()
  for (const { token, amount } of rows) {
    if (!token) continue
    const { cgId, decimals } = MAJOR_TOKENS[token]
    dailyVolume.addCGToken(cgId, Number(amount) / 10 ** decimals)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.NEAR],
  start: '2023-04-27',
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Volume: "Value of the tokens swapped on VEAX, from the swap events of the veax.near contract. Each swap is counted once, on its wNEAR, stablecoin, ETH, BTC or stNEAR side; swaps between two other tokens and the 2026-10-31 exploit are excluded.",
  },
}

export default adapter
