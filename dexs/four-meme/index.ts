import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

// Trades emit on TokenManager V1 (BNB) and TokenManager2 (BNB or ERC-20 quote), regardless of router.
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'

// Quote token: a supported ERC-20 quote (USDT/USD1/USDC/BUSD/CAKE) if it's in most of a token's trades, else BNB (native BNB pays emit no transfer).
const fetch = async (options: FetchOptions) => {
  const query = `
    WITH v2_trades AS (
      SELECT evt_tx_hash, token, cost FROM four_meme_bnb.tokenmanager2_evt_tokenpurchase
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT evt_tx_hash, token, cost FROM four_meme_bnb.tokenmanager2_evt_tokensale
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    tx_tokens AS (SELECT DISTINCT evt_tx_hash, token FROM v2_trades),
    token_trades AS (SELECT token AS meme, COUNT(DISTINCT evt_tx_hash) AS n_tx FROM v2_trades GROUP BY 1),
    stable_hits AS (
      SELECT tt.token AS meme, tr.contract_address AS base, COUNT(DISTINCT tt.evt_tx_hash) AS tx_hits
      FROM erc20_bnb.evt_transfer tr
      JOIN tx_tokens tt ON tt.evt_tx_hash = tr.evt_tx_hash
      WHERE tr.evt_block_time >= from_unixtime(${options.startTimestamp}) AND tr.evt_block_time < from_unixtime(${options.endTimestamp})
        AND tr.contract_address IN (
          0x55d398326f99059ff775485246999027b3197955, -- USDT
          0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d, -- USD1
          0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d, -- USDC
          0xe9e7cea3dedca5984780bafc599bd69add087d56, -- BUSD
          0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82  -- CAKE
        )
      GROUP BY 1, 2
    ),
    stable_base AS (
      SELECT meme, base FROM (
        SELECT s.meme, s.base, ROW_NUMBER() OVER (PARTITION BY s.meme ORDER BY s.tx_hits DESC) AS rn
        FROM stable_hits s JOIN token_trades tt ON tt.meme = s.meme
        WHERE s.tx_hits * 2 >= tt.n_tx
      ) x WHERE rn = 1
    ),
    per_base AS (
      SELECT COALESCE(sb.base, ${WBNB}) AS base_token, SUM(t.cost) AS amount
      FROM v2_trades t LEFT JOIN stable_base sb ON sb.meme = t.token
      GROUP BY 1
      UNION ALL
      SELECT ${WBNB} AS base_token, SUM(amount) AS amount FROM (
        SELECT etheramount AS amount FROM four_meme_bnb.tokenmanager_evt_tokenpurchase
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT etheramount AS amount FROM four_meme_bnb.tokenmanager_evt_tokensale
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      ) v1
    )
    SELECT lower('0x' || to_hex(base_token)) AS base_token, CAST(SUM(amount) AS varchar) AS amount
    FROM per_base GROUP BY 1
  `

  const dailyVolume = options.createBalances()
  const rows = await queryDuneSql(options, query)
  for (const row of rows) {
    if (row.amount) dailyVolume.add(row.base_token, row.amount)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-12-25',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Sum of every buy and sell on four.meme's V1 and V2 bonding curves, taken from the on-chain TokenPurchase/TokenSale events. Each trade's cost is valued in the curve's quote token: BNB by default, or the ERC-20 quote token (USDT, USD1, USDC, BUSD, CAKE) the curve is priced in.",
  },
}

export default adapter
