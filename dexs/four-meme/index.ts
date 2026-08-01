import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

// Trades emit on TokenManager V1 (BNB) and TokenManager2 (BNB or ERC-20 quote), regardless of router.
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'

// Quote token: ERC-20 quote (USDT/USD1/USDC/BUSD/CAKE) if any supported stable moves in the same tx (router/PCS paths never touch TokenManager2 directly); else BNB.
const fetch = async (options: FetchOptions) => {
  const query = `
    WITH v2_trades AS (
      SELECT evt_tx_hash, token, cost FROM four_meme_bnb.tokenmanager2_evt_tokenpurchase
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT evt_tx_hash, token, cost FROM four_meme_bnb.tokenmanager2_evt_tokensale
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    tx_any_stable AS (
      SELECT DISTINCT t.evt_tx_hash, tr.contract_address AS base
      FROM v2_trades t
      JOIN erc20_bnb.evt_transfer tr ON tr.evt_tx_hash = t.evt_tx_hash
      WHERE tr.evt_block_time >= from_unixtime(${options.startTimestamp}) AND tr.evt_block_time < from_unixtime(${options.endTimestamp})
        AND tr.contract_address IN (
          0x55d398326f99059ff775485246999027b3197955, -- USDT
          0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d, -- USD1
          0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d, -- USDC
          0xe9e7cea3dedca5984780bafc599bd69add087d56, -- BUSD
          0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82  -- CAKE
        )
    ),
    tx_base AS (
      SELECT evt_tx_hash, base FROM (
        SELECT evt_tx_hash, base, ROW_NUMBER() OVER (PARTITION BY evt_tx_hash ORDER BY base) AS rn
        FROM tx_any_stable
      ) x WHERE rn = 1
    ),
    per_base AS (
      SELECT COALESCE(tb.base, ${WBNB}) AS base_token, SUM(t.cost) AS amount
      FROM v2_trades t LEFT JOIN tx_base tb ON tb.evt_tx_hash = t.evt_tx_hash
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
