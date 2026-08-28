import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// On Ride Markets, the callers choose coin, duration, direction (up/down) and place a trade from
// treasury. Each trade is executed through our Trade Executor program, which routes the
// swap itself through Jupiter or DFlow.
// https://solscan.io/account/tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA
const TRADE_EXECUTOR = "tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA";

// Anchor discriminator of `execute_intent`, the instruction that fills a trade.
const EXECUTE_INTENT = "35822f9ae3dc7ad4";

const fetch = async (options: FetchOptions) => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const query = `
    WITH fill_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.raw.instructions
      WHERE program_id = '${TRADE_EXECUTOR}'
        AND data_hex_first16 = '${EXECUTE_INTENT}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
    ),
    hop_dedup AS (
      SELECT t.usd_amount
      FROM solana.dex.trades t
      INNER JOIN fill_txs f ON t.txn_id = f.txn_id
      WHERE t.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND t.block_timestamp < TO_TIMESTAMP_NTZ(${end})
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY t.txn_id, t.instruction_index
        ORDER BY t.usd_amount DESC NULLS LAST
      ) = 1
    )
    SELECT COALESCE(SUM(usd_amount), 0) AS volume
    FROM hop_dedup
  `;

  const data = await queryAllium(query);
  return {
    dailyVolume: data[0]?.volume ?? 0,
  };
};

const methodology = {
  Volume:
    "cumulative USD volme of the swaps Ride Markets routes on Solana, taken from Allium solana.dex.trades for transactions that carry an `execute_intent` instruction. Opening a trade and closing it are separate swaps and both are counted, as is each fill of a trade that executes in parts. Each outer instruction is counted once, at its largest hop, so multi-hop Jupiter routes are not double counted.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-03-21",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
