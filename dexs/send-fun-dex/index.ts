import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// send.fun DEX trading volume. Pairs with the fee adapter (fees/send-fun-dex)
// under the same "send-fun-dex" slug, mirroring PumpSwap (dexs/pump-swap +
// fees/pump-swap). Volume is the gross quote-denominated size of every swap on
// the constant-product AMM (program 84qj5FPZZdXkQy8mfowyg6RBZ3XKuTds6XS4ZYT1sfDX),
// read from the Dune-decoded TradeEvent (quote_amount_gross = quote moved before
// fees) and grouped by quote mint so DefiLlama prices it.
//
// Unlike PumpSwap (which reads Allium's curated solana.dex.trades with a
// wash-trade filter), send.fun is sourced from its own decoded events; no
// curated TVL/trader data is available to filter wash trades yet.
const SCHEMA = "sendfun_dex_solana";
const TRADE_TABLE = `${SCHEMA}.send_dex_evt_tradeevent`;

// SOL-quoted pools settle in wrapped SOL; guard against a decoder emitting the
// System Program id / null and normalize to WSOL so DefiLlama can price it.
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
function normalizeQuoteMint(mint: string | null | undefined): string {
  if (!mint || mint === SYSTEM_PROGRAM) return ADDRESSES.solana.SOL;
  return mint;
}

const fetch = async (options: FetchOptions) => {
  // Dune decodes each event under several IDL versions, one row each, so keep one row per event.
  const sql = `
    WITH trade_events AS (
      SELECT DISTINCT evt_tx_id, evt_outer_instruction_index, evt_inner_instruction_index, quote_mint, quote_amount_gross
      FROM ${TRADE_TABLE}
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
        AND quote_mint IS NOT NULL
    )
    SELECT
      quote_mint AS token,
      COALESCE(SUM(CAST(quote_amount_gross AS decimal(38, 0))), 0) AS volume
    FROM trade_events
    GROUP BY quote_mint
  `;

  const rows = await queryDuneSql(options, sql);

  const dailyVolume = options.createBalances();
  for (const row of rows ?? []) {
    dailyVolume.add(normalizeQuoteMint(row.token), row.volume);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-06-11",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Gross quote-denominated value of every swap on the send.fun DEX (constant-product AMM), summed from on-chain TradeEvents and priced by DefiLlama.",
  },
};

export default adapter;
