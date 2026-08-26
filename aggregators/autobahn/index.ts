import { CHAIN } from "../../helpers/chains";
import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// Autobahn is a Solana swap aggregator. Every swap it routes is initiated by its
// on-chain executor program, which dex_solana.trades tags via `trade_source`. A
// single swap can touch several pools (multi-hop), producing one row per hop, so
// we deduplicate to one representative row per swap instruction — the largest-USD
// hop per (tx_id, trader_id, outer_instruction_index) — mirroring the Jupiter
// aggregator adapter's methodology, before summing.
const AUTOBAHN_EXECUTOR = "bZbg2i9RhaQg2mEwYDRdrtacQZWKuiioRUmTzmNpu4D";

const fetch = async (options: FetchOptions) => {
  const data = await queryDuneSql(
    options,
    `
    SELECT COALESCE(SUM(amount_usd), 0) AS volume
    FROM (
      SELECT
        amount_usd,
        ROW_NUMBER() OVER (
          PARTITION BY tx_id, trader_id, outer_instruction_index
          ORDER BY amount_usd DESC
        ) AS rn
      FROM dex_solana.trades
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <  from_unixtime(${options.endTimestamp})
        AND trade_source = '${AUTOBAHN_EXECUTOR}'
    )
    WHERE rn = 1
    `,
  );

  return { dailyVolume: data[0].volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2026-01-15", // first trade in dex_solana.trades (Dune MIN(block_time))
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  methodology: {
    Volume:
      "Sum of the USD value of all swaps routed through the Autobahn aggregator, " +
      "read from dex_solana.trades filtered by Autobahn's executor program as trade_source. " +
      "Multi-hop swaps are deduplicated to the largest-USD hop per swap instruction to avoid double counting.",
  },
  isExpensiveAdapter: true,
};

export default adapter;
