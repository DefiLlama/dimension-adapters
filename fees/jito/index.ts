/*
  Source:
  - dailyFees: Represents MEV rewards/tips paid by users/searchers to Jito infrastructure (Relayer, Block Engine, Validators via Tip Distribution).
    Collected from transfers to Jito MEV-related program addresses.
  - dailyRevenue/dailyProtocolRevenue: Represents fees accruing specifically to the Jito DAO Treasury.
    This includes:
      - Withdrawal Fees (0.1% on unstake) from the JitoSOL stake pool.
      - Interceptor Fees (a portion of MEV rewards directed to the DAO).
      - Tip Router Fees (MEV tips explicitly routed to the DAO).
    This is calculated via the SQL query which sums transfers to specific DAO fee accounts.
  Note: Staking rewards distributed to JitoSOL holders are not included in these metrics.
*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSolanaReceived } from "../../helpers/token"
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune"

const fetchFees = async (_a:any, _b:any, options: FetchOptions) => {

  const targets = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  ]
  const sql = getSqlFromFile("helpers/queries/jito.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const fees: any[] = (await queryDuneSql(options, sql));
  const dailyFees = await getSolanaReceived({ options, targets, })

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addCGToken('usd', fees[0].total_usd_amt)

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: '2024-04-30',
      meta:{
        methodology: {
          fees: 'MEV rewards/tips paid by users/searchers to jito infra',
          protocolrevenue: 'fee accured to the jito DAO'
        }
      }
    }
  },
  isExpensiveAdapter: true
}

export default adapter
