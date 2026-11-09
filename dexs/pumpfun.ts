import ADDRESSES from '../helpers/coreAssets.json'
// Decoded Schema: https://github.com/duneanalytics/spellbook/blob/main/dbt_subprojects/solana/models/_sector/dex/pumpdotfun/solana/pumpdotfun_solana_base_trades.sql

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

// Custom Pairs (https://pump.fun/docs/custom-pairs): bonding curves quoted in an asset other than SOL.
// First USDC-quoted trade on-chain 2026-05-21; ~90 assets (xStocks, WBTC, PUMP, ...) from 2026-09-09;
// other pump.fun coins as quote from 2026-10-09. The dex_solana.trades spell keeps the SOL leg of those
// trades at 0, so from the first custom-pair trade volume is read from the program's own TradeEvent,
// grouped by quote mint and priced by DefiLlama (a quote we cannot price adds nothing).
// quote_mint/quote_amount are null on rows decoded before the IDL update.
const CUSTOM_PAIRS_START = 1779062400 // 2026-05-21
const SYSTEM_PROGRAM = '11111111111111111111111111111111' // quote_mint reported for SOL-quoted curves

const fetchFromTradeEvents = async (options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    SELECT
      COALESCE(quote_mint, '${SYSTEM_PROGRAM}') AS quote_mint,
      SUM(CASE WHEN quote_mint IS NULL THEN sol_amount ELSE quote_amount END) AS quote_amount
    FROM pumpdotfun_solana.pump_evt_tradeevent
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
    GROUP BY 1
  `)
  if (!rows.length) throw new Error('no pump TradeEvent rows for the window')

  const dailyVolume = options.createBalances()
  for (const { quote_mint, quote_amount } of rows)
    dailyVolume.add(quote_mint === SYSTEM_PROGRAM ? ADDRESSES.solana.SOL : quote_mint, quote_amount)
  return { dailyVolume }
}

const fetchFromSpell = async (options: FetchOptions) => {
  const vol = await queryDuneSql(options, `
    SELECT 
      SUM(
        CASE 
          WHEN token_sold_mint_address = '${ADDRESSES.solana.SOL}' 
          THEN token_sold_amount_raw
          WHEN token_bought_mint_address = '${ADDRESSES.solana.SOL}'
          THEN token_bought_amount_raw
          ELSE 0
        END
      ) / 1e9 as total_sol_volume
    FROM dex_solana.trades
    WHERE project = 'pumpdotfun'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  `);

  const dailyVolume = options.createBalances()
  dailyVolume.add(ADDRESSES.solana.SOL, vol[0].total_sol_volume*1e9);
  return { dailyVolume }
}

const fetch: any = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options)
  return options.startOfDay < CUSTOM_PAIRS_START ? fetchFromSpell(options) : fetchFromTradeEvents(options)
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-14',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Quote-asset side of every trade on pump.fun bonding curves: SOL, or the Custom Pair quote asset (USDC, tokenized stocks, WBTC, PUMP, other pump.fun coins, ...) since May 2026, priced by DefiLlama.",
  },
};

export default adapter;
