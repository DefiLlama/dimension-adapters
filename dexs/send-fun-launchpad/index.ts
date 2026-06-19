import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// send.fun launchpad (bonding-curve) trading volume. Pairs with the fee adapter
// (fees/send-fun) under the same "send-fun" slug, mirroring pump.fun
// (dexs/pumpfun + fees/pumpdotfun). Volume is the gross quote-denominated size
// of every bonding-curve swap (program 5R1uFyEE4oxqkm7hJDqHq6gXaLVF9dxeF3LF4yz1sfLP),
// read from the Dune-decoded TradeEvent (quote_amount_gross = quote moved before
// fees) and grouped by quote mint so DefiLlama prices it.
const SCHEMA = "sendfun_launchpad_solana";
const TRADE_TABLE = `${SCHEMA}.send_launchpad_evt_tradeevent`;

// SOL-quoted curves settle in wrapped SOL; guard against a decoder emitting the
// System Program id / null and normalize to WSOL so DefiLlama can price it.
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
function normalizeQuoteMint(mint: string | null | undefined): string {
  if (!mint || mint === SYSTEM_PROGRAM) return ADDRESSES.solana.SOL;
  return mint;
}

const fetch = async (options: FetchOptions) => {
  const sql = `
    SELECT
      quote_mint AS token,
      COALESCE(SUM(CAST(quote_amount_gross AS decimal(38, 0))), 0) AS volume
    FROM ${TRADE_TABLE}
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
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
      "Gross quote-denominated value of every bonding-curve swap on the send.fun launchpad, summed from on-chain TradeEvents and priced by DefiLlama.",
  },
};

export default adapter;
