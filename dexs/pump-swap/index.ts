import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { FetchOptions } from "../../adapters/types";

interface IData {
  quote_mint: string;
  quote_amount_raw: string;
}

// Volume is the quote-side amount of each trade, summed per quote mint and priced by DefiLlama, so a quote we
// cannot price adds nothing. No quote allowlist: Custom Pairs (https://pump.fun/docs/custom-pairs) allow many
// quote assets. Allium's usd_amount is only used for the pool TVL wash filter.
// Allium's token0/token1 order is arbitrary (SOL is token0 in ~1.1M pools and token1 in ~350k), so the quote is
// taken as whichever side appears in more PumpSwap pools: SOL, USDC, PUMP and every pair asset sit in many pools,
// a launched coin in one. ponytail: tie (both sides in a single pool) picks token1, such pools are unpriced anyway.
const fetch = async (options: FetchOptions) => {
  const query = `WITH pool_info AS (
        SELECT DISTINCT
          liquidity_pool_address,
          token0_address,
          token0_vault,
          token1_address,
          token1_vault
        FROM solana.dex.pools
        WHERE project = 'pumpswap'
      ),
      mint_pools AS (
        SELECT mint, COUNT(*) AS n
        FROM (SELECT token0_address AS mint FROM pool_info UNION ALL SELECT token1_address FROM pool_info)
        GROUP BY mint
      ),
      pool_quote AS (
        SELECT
          p.liquidity_pool_address,
          IFF(m1.n >= m0.n, p.token1_address, p.token0_address) AS quote_mint
        FROM pool_info p
        JOIN mint_pools m0 ON m0.mint = p.token0_address
        JOIN mint_pools m1 ON m1.mint = p.token1_address
      ),
      volume_data AS (
        SELECT
          t.pool,
          t.sender_token_acc,
          p.quote_mint,
          SUM(CASE WHEN t.token_sold_mint = p.quote_mint THEN t.token_sold_amount_raw ELSE t.token_bought_amount_raw END) AS quote_amount_raw
        FROM solana.dex.trades t
        JOIN pool_quote p ON p.liquidity_pool_address = t.pool
        WHERE t.project = 'pumpswap'
          AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
          AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
        GROUP BY t.pool, t.sender_token_acc, p.quote_mint
      ),
      pool_volume AS (
        SELECT
          pool,
          quote_mint,
          SUM(quote_amount_raw) as quote_amount_raw,
          COUNT(DISTINCT sender_token_acc) as unique_traders
        FROM volume_data
        GROUP BY pool, quote_mint
      ),
      pool_vaults AS (
        SELECT liquidity_pool_address AS pool, token0_vault AS vault, token0_address AS mint FROM pool_info WHERE liquidity_pool_address IN (SELECT pool FROM pool_volume)
        UNION ALL
        SELECT liquidity_pool_address AS pool, token1_vault AS vault, token1_address AS mint FROM pool_info WHERE liquidity_pool_address IN (SELECT pool FROM pool_volume)
      ),
      vault_bal AS (
        SELECT token_account, mint, usd_amount
        FROM solana.assets.balances_daily
        WHERE date >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
          AND date < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
          AND token_account IN (SELECT vault FROM pool_vaults)
      ),
      pool_tvl AS (
        SELECT
          pvault.pool as liquidity_pool_address,
          SUM(vb.usd_amount) as total_tvl_usd
        FROM pool_vaults pvault
        JOIN vault_bal vb
          ON vb.token_account = pvault.vault
          AND vb.mint = pvault.mint
        GROUP BY pvault.pool
      )
      SELECT
        pv.quote_mint,
        TO_VARCHAR(SUM(pv.quote_amount_raw)) as quote_amount_raw
      FROM pool_volume pv
      INNER JOIN pool_tvl pt ON pv.pool = pt.liquidity_pool_address
      WHERE pt.total_tvl_usd >= 5000 AND pv.unique_traders >= 50
      GROUP BY pv.quote_mint`

  const rows: IData[] = await queryAllium(query);
  if (!rows.length) throw new Error('no PumpSwap trades for the window')

  const dailyVolume = options.createBalances()
  for (const { quote_mint, quote_amount_raw } of rows) dailyVolume.add(quote_mint, quote_amount_raw)

  return {
    dailyVolume,
  }
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-02-20',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Volume: "Quote-side amount of every trade on PumpSwap pools, priced by DefiLlama, for pools with TVL >= $5,000 and at least 50 unique traders. This filters out wash trading pools.",
  }
}

export default adapter
