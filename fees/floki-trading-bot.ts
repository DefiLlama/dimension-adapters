import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune, queryDuneSql } from "../helpers/dune";
import { nullAddress } from "../helpers/token";

const duneQueryId: any = {
  [CHAIN.ETHEREUM]: '4082746',
  [CHAIN.BSC]: '4082749',
  [CHAIN.BASE]: '4082753',
}

async function fetchFees(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const rows = await queryDuneSql(options, `
WITH
  botTradesWithFees AS (
    SELECT
      date_trunc('day', block_time) AS block_date,
      type,
      blockchain,
      amount_usd,
      treasury_usd,
      buyback_usd,
      treasury_token_amount,
      buyback_token_amount,
      fee_token_symbol,
      fee_token_address,
      user,
      project_contract_address,
      tx_hash
    FROM
      query_3780205
    WHERE
      isLastTradeInTransaction = true -- This prevents over counting for multi-hop trades and excludes tax distributions 
  ),
  firstUserOccurrences AS (
    SELECT
      user,
      MIN(block_date) AS firstTradeDate
    FROM
      botTradesWithFees
    GROUP BY
      user
  )
SELECT
  block_date,
  SUM(amount_usd) AS totalVolumeUSD,
  COUNT(DISTINCT (botTradesWithFees.user)) AS numberOfUsers,
  COALESCE(COUNT(DISTINCT (firstUserOccurrences.user)), 0) AS numberOfNewUsers,
  SUM(IF(blockchain = 'Ethereum', amount_usd, 0)) AS ethereumVolumeUSD,
  SUM(IF(blockchain = 'Base', amount_usd, 0)) AS baseVolumeUSD,
  SUM(IF(blockchain = 'BSC', amount_usd, 0)) AS bscVolumeUSD,
  COUNT(
    DISTINCT (
      IF(
        blockchain = 'Ethereum',
        botTradesWithFees.user,
        NULL
      )
    )
  ) AS ethereumNumberOfUsers,
  COUNT(
    DISTINCT (
      IF(blockchain = 'Base', botTradesWithFees.user, NULL)
    )
  ) AS baseNumberOfUsers,
  COUNT(
    DISTINCT (
      IF(blockchain = 'BSC', botTradesWithFees.user, NULL)
    )
  ) AS bscNumberOfUsers,
  SUM(treasury_usd) AS treasuryFeesUSD,
  SUM(buyback_usd) AS buybackFeesUSD,
  SUM(treasury_usd) + SUM(buyback_usd) AS totalFeesUSD,
  SUM(
    IF(
      fee_token_symbol = 'ETH',
      treasury_token_amount,
      0
    )
  ) AS treasuryFeesETH,
  SUM(
    IF(
      fee_token_symbol = 'BNB',
      treasury_token_amount,
      0
    )
  ) AS trasuryFeesBNB,
  SUM(
    IF(fee_token_symbol = 'ETH', buyback_token_amount, 0)
  ) AS buybackFeesETH,
  SUM(
    IF(fee_token_symbol = 'BNB', buyback_token_amount, 0)
  ) AS buybackFeesBNB,
  COUNT(DISTINCT (tx_hash)) AS numberOfTrades,
  COUNT(DISTINCT (project_contract_address)) AS numberOfPairs,
  SUM(IF("type" = 'Buy', amount_usd, 0)) AS buyVolumeUSD,
  SUM(IF("type" = 'Sell', amount_usd, 0)) AS sellVolumeUSD,
  COUNT(DISTINCT (botTradesWithFees.user)) - COALESCE(COUNT(DISTINCT (firstUserOccurrences.user)), 0) AS numberOfReturningUsers,
  SUM(
    COALESCE(COUNT(DISTINCT (firstUserOccurrences.user)), 0)
  ) OVER (
    ORDER BY
      block_date
  ) AS cumulative_numberOfNewUsers
FROM
  botTradesWithFees
  LEFT OUTER JOIN firstUserOccurrences ON (
    botTradesWithFees.user = firstUserOccurrences.user
    AND botTradesWithFees.block_date = firstUserOccurrences.firstTradeDate
  )
WHERE
  block_date >= from_unixtime(${options.startTimestamp})
  AND block_date <= from_unixtime(${options.endTimestamp})
GROUP BY
  block_date
ORDER BY
  block_date DESC
  `)

  rows.map((row: any) => {
    dailyFees.add(nullAddress, row.treasuryFeesUSD)
  })

  return {
    dailyFees: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: 1685577600,
      runAtCurrTime: true,
    },
    // [CHAIN.BSC]: {
    //   fetch: fetchFees,
    //   start: 1685577600,
    //   runAtCurrTime: true,
    // },
    // [CHAIN.BASE]: {
    //   fetch: fetchFees,
    //   start: 1685577600,
    //   runAtCurrTime: true,
    // },
  },
  isExpensiveAdapter: true,
};

export default adapter;
